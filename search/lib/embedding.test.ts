import { getEmbedding } from './embedding';

const mockModel = { embed: jest.fn() };
const loadFnMock = jest.fn().mockResolvedValue(mockModel);

jest.mock('@tensorflow/tfjs-node');
jest.mock('@tensorflow-models/universal-sentence-encoder', () => ({
  load: () => loadFnMock(),
}));

describe('embedding', () => {
  describe('#loadModel', () => {
    it('should load the sentence encoder model if there is no model stored', async () => {
      await jest.isolateModulesAsync(async () => {
        const emb = await import('./embedding');

        const model = await emb.loadModel();

        expect(loadFnMock).toHaveBeenCalledTimes(1);
        expect(model).toEqual(mockModel);
      });
    });

    it('should not call the load fn when there is an existing model', async () => {
      await jest.isolateModulesAsync(async () => {
        const { loadModel } = await import('./embedding');

        const firstModel = await loadModel();
        const secondModel = await loadModel();

        expect(loadFnMock).toHaveBeenCalledTimes(1);
        expect(secondModel).toEqual(mockModel);
        expect(firstModel).toEqual(secondModel);
      });
    });
  });

  describe('#getEmbedding', () => {
    it('should get the embedding from the model and return the resulting vector', async () => {
      const mockEmbedding = [[10.3, 5.2, -8.7]];
      const testText = 'textToEmbed';
      mockModel.embed.mockResolvedValue({
        arraySync: jest.fn(() => mockEmbedding),
      });

      // @ts-expect-error: It's ok to pass a mock model for testing
      const embedding = await getEmbedding(mockModel, testText);

      expect(mockModel.embed).toHaveBeenCalledWith([testText]);
      expect(embedding).toEqual(mockEmbedding[0]);
    });
  });
});
