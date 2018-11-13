# lambda-tileserver

This is a stripped down version of
[tessera](https://github.com/mojodna/tessera) intended for deployment on AWS
Lambda.

At present, it only depends on
[`tilelive-tapalcatl`](https://github.com/mojodna/tilelive-tapalcatl), so it
will only support Tapalcatl 2 archives out of the box (to support other
sources, install appropriate `tilelive` modules).

It differs from tessera in 2 ways:

1. no static map generation -- this functionality depended on Mapnik, and the
   required dependency tree pushed the deployment artifact size past the 50MB
   size limit
2. no preview pages -- there's no inherent limitation preventing
   this, more that tessera still uses Bower to manage its public web views

## Deployment

Initialize an AWS deployment using [Claudia.js](https://claudiajs.com/):

```bash
npm run initialize-lambda
```

Deploy (or update) the Lambda function:

```bash
SOURCE=tapalcatl+s3://bucket/meta.json npm run deploy-lambda
```