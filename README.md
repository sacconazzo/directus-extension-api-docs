# directus-extension-api-docs

Directus Extension to include

-   a Swagger interface
-   configurable autogenerated openapi documentation file
    -- custom endpoint definitions included
-   validation middleware for your custom endpoints (based on your openapi)

> Compatible with latest versions of Directus and monorepo installation with packaged extension.

![workspace](assets/swagger.png)

All directus endpoints are autogenerated on runtime.

**You can enable validations middleware based on your custom definitions. See below**

## Prerequisites

Working in a Directus nodejs project

Ref: https://github.com/directus/directus

## Installation

    npm install directus-extension-api-docs

-   Swagger interface: by default `http://localhost:8055/api-docs`
-   Openapi documentation: by default `http://localhost:8055/api-docs/oas`

## Configuration (optional)

To include you custom endpoints in your documentation.

Create a `oasconfig.yaml` file under `/extensions` folder.

Options:

-   `docsPath` _optional_ path where the interface will be (default 'api-docs')
-   `info` _optional_ openapi server info (default extract from package.json)
-   `tags` _optional_ openapi custom tags (will be merged with all standard and all customs tags)
-   `publishedTags` _optional_ if specified, will be published definitions only for specified tags
-   `paths` _optional_ openapi custom paths (will be merged with all standard and all customs paths)
-   `components` _optional_ openapi custom components (will be merged with all standard and all customs tags)

Example below:

```
docsPath: 'api-docs'
info:
  title: my-directus-bo
  version: 1.5.0
  description: my server description
tags:
- name: MyCustomTag
  description: MyCustomTag description
publishedTags:
- MyCustomTag
components:
  schemas:
    UserId:
      type: object
      required:
      - user_id
      x-collection: directus_users
      properties:
        user_id:
          description: Unique identifier for the user.
          example: 63716273-0f29-4648-8a2a-2af2948f6f78
          type: string

```

## Definitions (optional)

For each endpoint extension, you can define api's including a file `oas.yaml` in root path of your extension endpoint folder.

Properties:

-   `tags` _optional_ openapi custom tags
-   `paths` _optional_ openapi custom paths
-   `components` _optional_ openapi custom components

Exemple below (`./extensions/my-endpoint-extensions/oas.yaml`) :

```
tags:
- name: MyCustomTag2
  description: MyCustomTag description2
paths:
  "/my-custom-path/my-endpoint":
    post:
      summary: Validate email
      description: Validate email
      tags:
        - MyCustomTag2
        - MyCustomTag
      requestBody:
        content:
          application/json:
            schema:
              "$ref": "#/components/schemas/UserId"
      responses:
        '200':
          description: Successful request
          content:
            application/json:
              schema:
                "$ref": "#/components/schemas/Users"
        '401':
          description: Unauthorized
          content: {}
        '422':
          description: Unprocessable Entity
          content: {}
        '500':
          description: Server Error
          content: {}
components:
  schemas:
    Users:
      type: object # ref to standard components declaring it empty
```

### Legacy mode

Configuration and definitions can also be managed in this structure:

```
- ./extensions/
  - endpoints/
    - oasconfig.yaml
    - my-endpoint-extensions/
      - oas.yaml
    - my-endpoint-extensions2/
      - oas.yaml
```

## Validations (optional)

You can enable a request validations middleware based on your custom definitions.

Call `validate` function inside your custom endpoint source (`./extensions/my-endpoint-extensions/src/index.js`).

Pass your `router`, `services`, `schema` and a list (_optional_) of endpoints you want to validate.

Example below:

```
const { validate } = require('directus-extension-api-docs')

const id = 'my-custom-path'

export default {
    id: 'info',
    handler: async (router, { services, getSchema }) => {
        const schema = await getSchema();
        await validate(router, services, schema); // Enable validator

        router.post('/my-endpoint', async (req, res, next) => {
            ...
        })
    },
}
```
