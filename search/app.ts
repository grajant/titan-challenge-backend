import { clinicsRoute, doctorsRoute, RouteWithHandler } from './routes';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const routes: RouteWithHandler = {
  '/search/doctors': doctorsRoute,
  '/search/clinics': clinicsRoute,
};

const errorResponse = (code: number, message: string): APIGatewayProxyResult => {
  return {
    statusCode: code,
    body: message,
  };
};

export const searchHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const handler = routes[event.path];

  return handler?.(event) ?? errorResponse(400, 'Invalid path');
};
