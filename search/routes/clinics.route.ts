import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const clinicsRoute = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: 'Clinics route works!',
  };
};
