// Production listen port. Dokploy and docker-compose set PORT as well;
// this default keeps `pnpm start` on the same unused port.
process.env.HOST ||= '0.0.0.0'
process.env.PORT ||= '8176'

await import('../.output/server/index.mjs')
