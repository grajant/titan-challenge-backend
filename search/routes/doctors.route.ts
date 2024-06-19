import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const doctorsRoute = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: 'Doctors route works!',
  };
};
