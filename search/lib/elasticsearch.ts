import { Client, ClientOptions } from '@elastic/elasticsearch';
import { getEmbedding, loadModel } from './embedding';
import { NPIResults } from '../schemas/npi.schema';

type ConfigOptions = ClientOptions & {
  index: string;
};

type SearchOptions = {
  queryFilter?: Record<string, unknown>;
  from?: number;
};

export class ElasticSearch {
  private readonly _client: Client;
  private readonly _initialIndex: string;
  private _index: string;

  constructor({ index, ...allConfig }: ConfigOptions) {
    this._client = new Client(allConfig);
    this._initialIndex = index;
    this._index = index;

    this._client.ping((err) => {
      if (!err) return console.debug('Connected to the Elastic search server');

      console.error('Connection to Elasticsearch failed', err);
    });
  }

  public async indexData(data: NPIResults, indexSuffix: string) {
    console.debug('Data to index cnt', data.length);

    const model = await loadModel();
    console.debug('Semantic Model loaded!');

    // Update the index with the given suffix to avoid data pollution.
    this._index = `${this._initialIndex}${indexSuffix}`;

    await this._client.indices.create(
      {
        index: this._index,
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

    const body: Array<Record<string, unknown>> = [];
    for (const datum of data) {
      const embedding = await getEmbedding(model, datum.fullName);
      body.push({ index: { _index: this._index, _id: datum.id } });
      body.push({ ...datum, embedding });
    }

    await this._client.bulk({ refresh: true, body });
    const { body: count } = await this._client.count({ index: this._index });
    console.log(count);
  }

  public async embeddingSearch(query: string, { queryFilter, from = 0 }: SearchOptions = {}) {
    const model = await loadModel();
    const queryEmbedding = await getEmbedding(model, query);

    const { body } = await this._client.search({
      index: this._index,
      from,
      body: {
        query: {
          /* This was the query used when ElasticSearch was being used
          script_score: {
            query: {
              ...queryFilter,
            },
            script: {
              source: `
                cosineSimilarity(params.query_vector, doc['embedding']) + 1.0
              `,
              params: {
                query_vector: queryEmbedding,
              },
            },
          },
          */
          bool: {
            ...queryFilter,
            must: {
              knn: {
                embedding: {
                  vector: queryEmbedding,
                  k: 40,
                },
              },
            },
          },
        },
      },
      size: 200,
      _source_excludes: ['embedding'],
    });

    return body.hits;
  }
}
