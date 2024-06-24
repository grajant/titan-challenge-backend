# titan-challenge-backend

This project contains source code and supporting files for a serverless application that includes **one lambda function
** to
search doctors from the NPI registry. It can be deployed with the SAM
CLI. It includes the following files and folders.

- search - Code for the application's Lambda function written in TypeScript.
- events - Invocation events that you can use to invoke the function.
- template.yaml - A template that defines the application's AWS resources.

The application uses several AWS resources, including Lambda functions and an API Gateway API. These resources are
defined in the `template.yaml` file in this project. The template may be updated to add AWS resources through the same
deployment process that updates the application code.

## Setup instructions

### Prerequisites

In order to run this project locally and deploy to the cloud, you need the following tools:

* SAM
  CLI - [Install the SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
* Node.js - [Install Node.js 20](https://nodejs.org/en/), including the NPM package management tool.
* Docker - [Install Docker community edition](https://hub.docker.com/search/?type=edition&offering=community)

### Deploy the sample application

The Serverless Application Model Command Line Interface (SAM CLI) is an extension of the AWS CLI that adds functionality
for building and testing Lambda applications. It uses Docker to run your functions in an Amazon Linux environment that
matches Lambda. It can also emulate your application's build environment and API.

To build and deploy your application for the first time, run the following in your shell:

```bash
sam build
sam deploy --guided
```

The first command will build the source of your application. The second command will package and deploy your application
to AWS, with a series of prompts. Please visit
the [SAM CLI Deploy tutorial](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-getting-started-hello-world.html#serverless-getting-started-hello-world-deploy)
for more info.

### Use the SAM CLI to build and test locally

Build your application with the `sam build` command.

```bash
titan-challenge-backend$ sam build
```

The SAM CLI installs dependencies defined in `search/package.json`, compiles TypeScript with esbuild, creates a
deployment package, and saves it in the `.aws-sam/build` folder.

Test a single function by invoking it directly with a test event. An event is a JSON document that represents the input
that the function receives from the event source. Test events are included in the `events` folder in this project.

Run functions locally and invoke them with the `sam local invoke` command.

```bash
titan-challenge-backend$ sam local invoke SearchFunction --event events/event.json
```

The SAM CLI can also emulate your application's API. Use the `sam local start-api` to run the API locally on port 3000.

```bash
titan-challenge-backend$ sam local start-api
titan-challenge-backend$ curl http://localhost:3000/
```

## Unit tests

Most tests are defined next to their corresponding source file with the `.test` suffix. Other tests can be found
under `search/tests`
folder in this project. Use NPM to install
the [Jest test framework](https://jestjs.io/) and run unit tests.

```bash
titan-challenge-backend$ cd search
titan-challenge-backend/search$ npm install
titan-challenge-backend/search$ npm run test
```

## Api usage

In order to use the API, make a GET request to the `/search/doctors` path.
The API can take the following query parameters:

* `firstName`**(required)** - The first name of the doctor you are seeking.
* `lastName`**(required)** - The last name of the doctor you are seeking.
* `state`_(optional)_ - This parameter allows narrowing the search by the geographical location (state) of the doctor.
  Use the abbreviation form of the states e.g. `TX` (Texas).

Additionally, this API supports pagination. You can specify the number of results per page (limit) and the number of
results to skip at the beginning (skip).

* `limit`*(optional)* - The number of results to return per page. If not specified, the API defaults to `200`.
* `skip`*(optional)* - The number of results to skip before starting to return responses. This is useful for
  implementing paginated requests. When this is not provided, no results will be skipped.

### Usages examples

- Simple search for a doctor named **John Doe**

```bash
curl -X GET "https://api-endpoint/search/doctors?firstName=John&lastName=Doe"
```

- Search for a doctor named **Sam Wright** in the state of **California**

```bash
curl -X GET "https://api-endpoint/search/doctors?firstName=Sam&lastName=Wright&state=CA"
```

- Make a search that will yield the first 40 elements.

```bash
curl -X GET "https://api-endpoint/search/doctors?firstName=Jane&lastName=Doe&limit=40"
```

- Skip the first 50 results from the search

```bash
curl -X GET "https://api-endpoint/search/doctors?firstName=Jane&lastName=Doe&skip=50"
```

Please ensure that all query parameters are correctly URL encoded if they contain special characters or spaces.

## Architectural design

This section is dedicated to discussing the architectural design of the project. Here, we go over the high-level
structure of our codebase, how different components interact with each other, and how data flows within our system.

### Code Structure

The codebase was based on the serverless template from the SAM CLI tool, which makes it easy to maintain and understand.
It was furthered modularized to enhance maintainability and scalability. The main parts include
the `search` module that contains the Lambda function, and the `events` folder that holds event data for testing.

```plaintext
root
  |
  |-- search  # houses the Lambda function and all source code related
    |--lib # contains abstractions and implementations of libraries functions, e.g. elasticsearch
    |--routes # holds the API routes. Even though this project only has one path, this would allow to easily scale if new paths are required
  |-- events  # provides test event data
  |-- .aws-sam  # Sam CLI config
  |-- template.yaml  # Defines AWS resources
```

### Architecture diagram

The following diagram depicts how the different elements interact with each other. The application starts its workflow
from the AWS API Gateway, which triggers our Lambda function upon receiving a
request at the `/search/doctors` endpoint. The function then interacts with the NPI (National Provider Identifier)
registry to fetch the required data. Once the data is obtained, it is indexed in the ElasticSearch server and then a
search
is performed in that same server. The search results are then returned to the requesting client.

![Architectural diagram](./assets/arch-diagram.svg)
**Note:** Online diagram - https://online.visual-paradigm.com/share.jsp?id=333434373837342d31

### Key Components

Here, we will briefly go over the main components of the architecture:

- **AWS Lambda Function**: Our primary application logic resides here. It handles requests, interacts with the NPI
  registry, and sends responses.
- **NPI Registry**: The National Provider Identifier registry where we collect our data.
- **AWS API Gateway**: The gateway that handles the request and response handling for our application.
- **AWS ElasticSearch**: The search engine that allows us to index data and perform complex search queries, including
  searches with embeddings, which is a key piece to getting accurate semantic results. In this project, the search uses
  the k-NN algorithm to find correlation between the embedding vectors
- **AWS SAM CLI**: The tool we use to build and deploy the application, as well as perform local testing.

