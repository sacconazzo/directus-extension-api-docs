// Legacy YAML pipeline demo:
//   - oas.yaml declares the OpenAPI for /yaml-demo/echo
//   - validate() activates express-openapi-validator using that spec
//   - the handler receives a body already validated against oas.yaml
const { validate } = require('directus-extension-api-docs');

module.exports = {
    id: 'yaml-demo',
    handler: async (router, { services, getSchema }) => {
        const schema = await getSchema();
        await validate(router, services, schema);

        router.post('/echo', (req, res) => {
            res.json({ ok: true, payload: req.body });
        });
    },
};
