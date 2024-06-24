import testEvent from '../../events/event-doctors.json';
import { doctorsRoute } from './doctors.route';
import { NPIResult, npiSchema } from '../schemas/npi.schema';
import { ElasticSearch } from '../lib/elasticsearch';

const mockFetchJson = jest.fn().mockResolvedValue({});
const mockFetch = jest.fn().mockResolvedValue({
  json: () => mockFetchJson(),
});
const mockIndexData = jest.fn().mockResolvedValue(null);
const mockEmbeddingSearch = jest.fn().mockResolvedValue({});

global.fetch = mockFetch;

jest.mock('aws-sdk', () => ({
  __esModule: true,
  default: {
    config: {
      update: jest.fn(),
    },
    Credentials: jest.fn(),
  },
}));

jest.mock('../lib/elasticsearch', () => ({
  __esModule: true,
  ElasticSearch: jest.fn(() => ({
    indexData: (...args) => mockIndexData(...args),
    embeddingSearch: (...args) => mockEmbeddingSearch(...args),
  })),
}));

const mockNpiResults: NPIResult[] = [
  {
    number: '1098987',
    addresses: [
      {
        address_1: 'Wallaby St',
        address_purpose: 'LOCATION',
        state: 'FL',
        city: 'MIAMI',
        postal_code: '75089',
        telephone_number: '500-400-10',
      },
    ],
    basic: {
      first_name: 'Jon',
      last_name: 'Doe',
    },
    taxonomies: [
      {
        code: 'some_Code',
        desc: 'Dentist',
      },
    ],
  },
];

describe('Doctors Route - "search/doctors"', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('#fetchNpiRegistry', () => {
    it('should fetch the doctors from the NPI registry with the query params from the API event', async () => {
      const firstName = testEvent.queryStringParameters.firstName;
      const lastName = testEvent.queryStringParameters.lastName;
      const expectedQueryParams = new URLSearchParams({
        country_code: 'US',
        first_name: firstName,
        last_name: lastName,
        limit: '200',
        skip: '0',
      });
      const secondCallParams = new URLSearchParams(expectedQueryParams);
      secondCallParams.set('limit', '1');
      secondCallParams.set('skip', '200');

      // @ts-expect-error: The defined event has the required data for testing
      await doctorsRoute(testEvent);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `https://npiregistry.cms.hhs.gov/api/?version=2.1&${expectedQueryParams.toString()}`,
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        `https://npiregistry.cms.hhs.gov/api/?version=2.1&${secondCallParams.toString()}`,
      );
    });

    it('should return the transformed data from the first call and "hasMoreToFetch" in false when the second call has 0 count', async () => {
      const parsedData = npiSchema.parse({ results: mockNpiResults, result_count: 1 });
      mockFetchJson
        .mockResolvedValueOnce({ results: mockNpiResults, result_count: 1 })
        .mockResolvedValueOnce({ result_count: 0, results: [] });

      // @ts-expect-error: The defined event has the required data for testing
      const response = await doctorsRoute(testEvent);

      expect(mockIndexData).toHaveBeenLastCalledWith(parsedData.results, expect.any(String));
      expect(response.body).toContain(
        JSON.stringify({
          hasMoreToFetch: false,
        }),
      );
    });

    it('should return "hasMoreToFetch" with true when the second call has count in 1', async () => {
      mockFetchJson
        .mockResolvedValueOnce({ results: mockNpiResults, result_count: 1 })
        .mockResolvedValueOnce({ result_count: 1, results: [] });

      // @ts-expect-error: The defined event has the required data for testing
      const response = await doctorsRoute(testEvent);

      expect(response.body).toContain(
        JSON.stringify({
          hasMoreToFetch: true,
        }),
      );
    });
  });

  describe('ElasticSearch init', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetModules(); // Ensure that a fresh copy of process.env is used
      process.env = { ...OLD_ENV };
    });

    afterEach(() => {
      process.env = OLD_ENV; // Restore old environment
    });

    it('should create an instance of "ElasticSearch" with connection details for the Prod stage', async () => {
      const mockedEsEndpoint = 'http://elasticsearch.io/v1/';

      await jest.isolateModulesAsync(async () => {
        jest.mock('../lib/elasticsearch', () => ({
          __esModule: true,
          ElasticSearch: jest.fn(() => ({})),
        }));

        process.env.ELASTIC_SEARCH_ENDPOINT = mockedEsEndpoint;
        process.env.STAGE = 'Prod';
        await import('./doctors.route');
        const { ElasticSearch } = await import('../lib/elasticsearch');
        const mockedElasticSearch = jest.mocked(ElasticSearch);

        expect(mockedElasticSearch).toHaveBeenCalledWith({
          index: 'doctors',
          node: mockedEsEndpoint,
          Connection: expect.any(Function),
          Transport: expect.any(Function),
        });
      });
    });

    it('should create an instance of "ElasticSearch" with index=doctors and the node from the env variable', async () => {
      const mockedEsEndpoint = 'http://elasticsearch.io/v1/';

      await jest.isolateModulesAsync(async () => {
        jest.mock('../lib/elasticsearch', () => ({
          __esModule: true,
          ElasticSearch: jest.fn(() => ({})),
        }));

        process.env.ELASTIC_SEARCH_ENDPOINT = mockedEsEndpoint;
        process.env.STAGE = 'Dev';
        await import('./doctors.route');
        const { ElasticSearch } = await import('../lib/elasticsearch');
        const mockedElasticSearch = jest.mocked(ElasticSearch);

        expect(mockedElasticSearch).toHaveBeenCalledWith({
          index: 'doctors',
          node: mockedEsEndpoint,
        });
      });
    });
  });

  it('should return early when the result from the NPI registry has no matches', async () => {
    mockFetchJson
      .mockResolvedValueOnce({ results: [], result_count: 0 })
      .mockResolvedValueOnce({ result_count: 1, results: [] });

    // @ts-expect-error: The defined event has the required data for testing
    const response = await doctorsRoute(testEvent);

    expect(response.body).toContain(
      JSON.stringify({
        searchResults: [],
        hasMoreToFetch: false,
      }),
    );
    expect(mockIndexData).not.toHaveBeenCalled();
    expect(mockEmbeddingSearch).not.toHaveBeenCalled();
  });

  it('should index the data from the NPI registry and search based on the given "firstName" and "lastName"', async () => {
    const firstName = testEvent.queryStringParameters.firstName;
    const lastName = testEvent.queryStringParameters.lastName;
    const parsedNpiData = npiSchema.parse({ results: mockNpiResults, result_count: 1 });

    mockFetchJson
      .mockResolvedValueOnce({ results: mockNpiResults, result_count: 1 })
      .mockResolvedValueOnce({ result_count: 1, results: [] });
    // @ts-expect-error: The defined event has the required data for testing
    await doctorsRoute(testEvent);

    expect(mockIndexData).toHaveBeenCalledWith(parsedNpiData.results, `_${firstName}_${lastName}`.toLowerCase());
    expect(mockEmbeddingSearch).toHaveBeenCalledWith(`${firstName} ${lastName}`.toUpperCase(), {
      queryFilter: undefined,
      from: 0,
    });
  });
});
