import { doctorsRoute } from './doctors.route';
import { clinicsRoute } from './clinics.route';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export { doctorsRoute, clinicsRoute };

export type RouteWithHandler = Record<string, (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>>;
