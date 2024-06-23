import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { npiSchema } from '../schemas/npi.schema';
import { ElasticSearch } from '../lib/elasticsearch';
import connectionFactory from 'aws-elasticsearch-connector';
import AWS from 'aws-sdk';

AWS.config.update({
  region: 'us-east-1',
});

const stage: 'Prod' | 'Dev' = (process.env.STAGE || 'Prod') as 'Prod' | 'Dev';
console.debug('Env variable::STAGE', stage);
console.debug('Env variable::ELASTIC_ENDPOINT', process.env.ELASTIC_SEARCH_ENDPOINT);

const elasticSearch = new ElasticSearch({
  index: 'doctors',
  node: process.env.ELASTIC_SEARCH_ENDPOINT,
  ...(stage === 'Prod' ? connectionFactory(AWS.config) : {}),
});

const httpResponse = (code: number, body: Record<string, unknown>): APIGatewayProxyResult => {
  return {
    statusCode: code,
    body: JSON.stringify(body),
  };
};

async function fetchNpiRegistry(queryParams: Record<string, string | undefined> | null) {
  const { firstName = '', lastName = '', state, limit = '200', skip = '0' } = queryParams || {};
  const limitNum = parseInt(limit, 10);
  const skipNum = parseInt(skip, 10);

  const searchParams = new URLSearchParams({
    country_code: 'US',
    first_name: firstName,
    last_name: lastName,
    limit,
    skip,
    ...(state ? { state } : {}),
  });
  const singleElmParams = new URLSearchParams(searchParams);
  singleElmParams.set('limit', '1');
  singleElmParams.set('skip', (limitNum + skipNum).toString());
  console.debug('Query params::Search', searchParams, 'Query params::next', singleElmParams.toString());

  // Make the original call plus an additional call to determine if there's more data to fetch
  const [searchResponse, nextResponse] = await Promise.all([
    fetch(`https://npiregistry.cms.hhs.gov/api/?version=2.1&${searchParams.toString()}`),
    fetch(`https://npiregistry.cms.hhs.gov/api/?version=2.1&${singleElmParams.toString()}`),
  ]);
  const data = await searchResponse.json();
  const nextResData = await nextResponse.json();
  const parsedData = npiSchema.safeParse(data);

  if (!parsedData.success) throw new Error(JSON.stringify(parsedData.error.flatten().fieldErrors));

  const nextResParsedData = npiSchema.parse(nextResData);
  return {
    data: parsedData.data,
    hasMoreToFetch: nextResParsedData.result_count > 0,
  };
}

export const doctorsRoute = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { firstName = '', lastName = '', state, skip = '0' } = event.queryStringParameters || {};
    const { data: npiData, hasMoreToFetch } = await fetchNpiRegistry(event.queryStringParameters);

    // Return early when the registry yields no results for the search
    if (!npiData.results.length) return httpResponse(200, { searchResults: [], hasMoreToFetch: false });

    const queryFilter = !state
      ? undefined
      : {
          filter: [{ match: { 'address.state': state } }],
        };
    await elasticSearch.indexData(npiData.results, `_${firstName}_${lastName}`.toLowerCase());
    const hits = await elasticSearch.embeddingSearch(`${firstName} ${lastName}`.toUpperCase(), {
      queryFilter,
      from: parseInt(skip, 10),
    });

    return httpResponse(200, {
      searchResults: hits.hits,
      hasMoreToFetch,
    });
  } catch (err) {
    console.log(err);
    return httpResponse(500, { message: 'An unexpected error occurred', err });
  }
};
