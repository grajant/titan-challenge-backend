import { ElasticSearch } from './elasticsearch';
import { NPIResults } from '../schemas/npi.schema';
import { Client, ClientOptions } from '@elastic/elasticsearch';

const esClientMock = {
  bulk: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue({ body: 0 }),
  indices: {
    create: jest.fn().mockResolvedValue(null),
  },
  ping: jest.fn(),
  search: jest.fn().mockResolvedValue({ body: { hits: [] } }),
};

const mockEmbeddingImpl = (text: string) => [text.length, text.length + 1, text.length + 2];

jest.mock('@elastic/elasticsearch', () => ({
  __esModule: true,
  Client: jest.fn().mockImplementation(() => esClientMock),
}));

jest.mock('./embedding', () => ({
  __esModule: true,
  getEmbedding: jest.fn().mockImplementation(async (_m, text: string) => mockEmbeddingImpl(text)),
  loadModel: jest.fn().mockResolvedValue(null),
}));
const mockedClient = jest.mocked(Client);

describe('ElasticSearch', () => {
  const globalIndex = 'some-index';
  let esElm: ElasticSearch;

  beforeEach(() => {
    esElm = new ElasticSearch({
      index: globalIndex,
      node: '',
    });

    jest.clearAllMocks();
  });

  it('should initialize the elastic search client with the given options as well as the index', () => {
    const textIndex = 'test-index';
    const testEsOptions: ClientOptions = {
      node: 'http://elastic-test:8080',
      maxRetries: 5,
      requestTimeout: 1000,
    };

    const esClient = new ElasticSearch({
      index: textIndex,
      ...testEsOptions,
    });

    expect(esClient['_client']).toBeDefined();
    expect(esClient['_client']).toEqual(esClientMock);
    expect(esClient['_index']).toBe(textIndex);
    expect(esClient['_initialIndex']).toBe(textIndex);
    expect(mockedClient).toHaveBeenCalledWith(testEsOptions);
  });

  it('should make a ping the elasticsearch server and log when there is a response', () => {
    const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => ({}));
    new ElasticSearch({
      index: '',
      node: 'http://example.com/',
    });

    const callbackFn = esClientMock.ping.mock.calls[0][0];
    callbackFn();

    expect(esClientMock.ping).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('Connected to the Elastic search server');
  });

  describe('#indexData', () => {
    const indexSuffix = '_my_suffix';
    const testData: NPIResults = [
      {
        id: '1226987',
        fullName: 'Jon Doe',
        address: {
          city: 'MIAMI',
          street: 'WALLABY ST 34',
          state: 'FL',
        },
        telephoneNumber: '500-400-20',
        specialty: 'Dentist',
      },
      {
        id: '122698789',
        fullName: 'Jane Doe',
        address: {
          city: 'MIAMI',
          street: 'WALLABY ST 34',
          state: 'FL',
        },
        telephoneNumber: '500-400-20',
        specialty: 'Dentist',
      },
    ];

    it('should create the proper mapping for the index including the embedding prop', async () => {
      await esElm.indexData([], indexSuffix);

      expect(esClientMock.indices.create).toHaveBeenCalledWith(
        {
          index: `${globalIndex}${indexSuffix}`,
          body: {
            settings: {
              'index.knn': true,
            },
            mappings: {
              properties: {
                id: { type: 'keyword' },
                fullName: { type: 'text' },
                specialty: { type: 'text' },
                address: {
                  properties: {
                    street: { type: 'text' },
                    city: { type: 'text' },
                    state: { type: 'text' },
                  },
                },
                telephoneNumber: { type: 'text' },
                embedding: {
                  type: 'knn_vector',
                  dimension: 512,
                },
              },
            },
          },
        },
        { ignore: [400] },
      );
    });

    it('should perform a "bulk" operation with the given data including every elm embedding', async () => {
      const embedding0 = mockEmbeddingImpl(testData[0].fullName);
      const embedding1 = mockEmbeddingImpl(testData[1].fullName);
      const expectedBulkBody = [
        { index: { _index: `${globalIndex}${indexSuffix}`, _id: testData[0].id } },
        { ...testData[0], embedding: embedding0 },
        { index: { _index: `${globalIndex}${indexSuffix}`, _id: testData[1].id } },
        { ...testData[1], embedding: embedding1 },
      ];

      await esElm.indexData(testData, indexSuffix);

      expect(esClientMock.bulk).toHaveBeenCalledWith({ refresh: true, body: expectedBulkBody });
    });
  });

  describe('#embeddingSearch', () => {
    // This test was created when the implementation relied on ElasticSearch library
    xit('should search the given text by using a "script_score" query with the "cosineSimilarity" function and the default params', async () => {
      const searchText = 'John Doe';
      const defaultSearchOptions = { queryFilter: { match_all: {} }, from: 0 };

      const expectedSearchBody = {
        index: esElm['_index'],
        from: defaultSearchOptions.from,
        body: {
          query: {
            script_score: {
              query: {
                ...defaultSearchOptions.queryFilter,
              },
              script: {
                source: `
                cosineSimilarity(params.query_vector, 'embedding') + 1.0
              `,
                params: {
                  query_vector: mockEmbeddingImpl(searchText),
                },
              },
            },
          },
        },
        size: 200,
        _source_excludes: ['embedding'],
      };

      await esElm.embeddingSearch(searchText);

      expect(esClientMock.search).toHaveBeenCalledWith(expectedSearchBody);
    });

    it('should search the given text by using a "knn" query with the default params', async () => {
      const searchText = 'John Doe';
      const defaultSearchOptions = { from: 0 };

      const expectedSearchBody = {
        index: esElm['_index'],
        from: defaultSearchOptions.from,
        body: {
          query: {
            bool: {
              must: {
                knn: {
                  embedding: {
                    vector: mockEmbeddingImpl(searchText),
                    k: 40,
                  },
                },
              },
            },
          },
        },
        size: 200,
        _source_excludes: ['embedding'],
      };

      await esElm.embeddingSearch(searchText);

      expect(esClientMock.search).toHaveBeenCalledWith(expectedSearchBody);
    });

    it('should return the "hits" from the search results', async () => {
      const mockedSearchResults = {
        body: {
          hits: {
            hits: [
              { _source: { id: '18798798', fullName: 'Jon Doe' }, _id: 'id2', _score: 1.8 },
              { _source: { id: '13234987', fullName: 'Jane Doe' }, _id: 'id1', _score: 1.6 },
            ],
          },
        },
      };
      esClientMock.search.mockResolvedValue(mockedSearchResults);

      const searchText = 'John Doe';
      const searchResult = await esElm.embeddingSearch(searchText);

      expect(esClientMock.search).toHaveBeenCalled();
      expect(searchResult).toEqual(mockedSearchResults.body.hits);
    });

    it('should use the given parameters for the search', async () => {
      const searchText = 'Jane Doe';
      const options = {
        queryFilter: {
          match: {
            fullName: searchText,
          },
        },
        from: 50,
      };

      const expectedSearchBody = {
        index: esElm['_index'],
        from: options.from,
        body: {
          query: {
            bool: {
              ...options.queryFilter,
              must: {
                knn: {
                  embedding: {
                    vector: mockEmbeddingImpl(searchText),
                    k: 40,
                  },
                },
              },
            },
          },
        },
        size: 200,
        _source_excludes: ['embedding'],
      };

      await esElm.embeddingSearch(searchText, options);

      expect(esClientMock.search).toHaveBeenCalledWith(expectedSearchBody);
    });
  });
});
