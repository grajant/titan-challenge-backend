FROM public.ecr.aws/lambda/nodejs:20 as builder

WORKDIR /usr/app
COPY . .

RUN npm install
RUN npm run build --verbose
# If you are building your code for production, instead include a package-lock.json file on this directory and use:
# RUN npm ci --production

FROM public.ecr.aws/lambda/nodejs:20
WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=builder /usr/app/dist/* ./
COPY --from=builder /usr/app/node_modules ./node_modules
CMD ["app.searchHandler"]
