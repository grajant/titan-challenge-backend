import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { searchHandler } from '../../app';

const mockDoctorsRoute = jest.fn();

jest.mock('../../routes', () => ({
  __esModule: true,
  doctorsRoute: () => mockDoctorsRoute(),
}));

describe('Search fn lambda handler', function () {
  it('should use the doctors handler when the path is "/search/doctors"', async () => {
    const event: APIGatewayProxyEvent = {
      httpMethod: 'get',
      body: '',
      headers: {},
      isBase64Encoded: false,
      multiValueHeaders: {},
      multiValueQueryStringParameters: {},
      path: '/search/doctors',
      pathParameters: {},
      queryStringParameters: {},
      requestContext: {
        accountId: '123456789012',
        apiId: '1234',
        authorizer: {},
        httpMethod: 'get',
        identity: {
          accessKey: '',
          accountId: '',
          apiKey: '',
          apiKeyId: '',
          caller: '',
          clientCert: {
            clientCertPem: '',
            issuerDN: '',
            serialNumber: '',
            subjectDN: '',
            validity: { notAfter: '', notBefore: '' },
          },
          cognitoAuthenticationProvider: '',
          cognitoAuthenticationType: '',
          cognitoIdentityId: '',
          cognitoIdentityPoolId: '',
          principalOrgId: '',
          sourceIp: '',
          user: '',
          userAgent: '',
          userArn: '',
        },
        path: '/hello',
        protocol: 'HTTP/1.1',
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
        requestTimeEpoch: 1428582896000,
        resourceId: '123456',
        resourcePath: '/hello',
        stage: 'dev',
      },
      resource: '',
      stageVariables: {},
    };
    const mockedResponse: APIGatewayProxyResult = {
      statusCode: 200,
      body: JSON.stringify({
        searchResults: [],
      }),
    };
    mockDoctorsRoute.mockResolvedValueOnce(mockedResponse);

    const result: APIGatewayProxyResult = await searchHandler(event);

    expect(result.statusCode).toEqual(mockedResponse.statusCode);
    expect(result.body).toEqual(mockedResponse.body);
  });
});
