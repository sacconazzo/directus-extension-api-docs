// Legacy YAML pipeline demo:
//   - oas.yaml declares OpenAPI for every /yaml-demo/* route
//   - validate() activates express-openapi-validator using that spec
//   - handlers receive bodies/params already validated against the YAML
const { validate } = require('directus-extension-api-docs');

// Tiny in-memory stub so the 200/404 demo paths have something to return.
const KNOWN = new Set(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']);

module.exports = {
    id: 'yaml-demo',
    handler: async (router, { services, getSchema }) => {
        const schema = await getSchema();
        await validate(router, services, schema);

        // POST /yaml-demo/echo — body validation via oas.yaml
        router.post('/echo', (req, res) => {
            res.json({ ok: true, payload: req.body });
        });

        // GET /yaml-demo/users/:id — path param + multi-status response
        router.get('/users/:id', (req, res) => {
            if (!KNOWN.has(req.params.id)) {
                return res.status(404).json({ message: 'user not found', code: 'NOT_FOUND' });
            }
            res.json({ id: req.params.id, email: 'alice@example.com' });
        });

        // DELETE /yaml-demo/items/:id — DELETE verb, 204 No Content
        router.delete('/items/:id', (req, res) => {
            if (!KNOWN.has(req.params.id)) {
                return res.status(404).json({ message: 'item not found' });
            }
            res.status(204).end();
        });
    },
};
