import dotenv from 'dotenv'
import Wolfgang from './server'

const run = async () => {
  dotenv.config()
  const hostname = maybeStr(process.env.WOLFGANG_HOSTNAME) ?? 'example.com'
  const server = await Wolfgang.create({
    devel: !!maybeInt(process.env.WOLFGANG_DEVEL) ?? true,
    port: maybeInt(process.env.WOLFGANG_PORT) ?? 3000,
    listenhost: maybeStr(process.env.WOLFGANG_LISTENHOST) ?? 'localhost',
    bskyIdentifier: maybeStr(process.env.WOLFGANG_BSKY_IDENTIFIER) ?? '',
    bskyPassword: maybeStr(process.env.WOLFGANG_BSKY_PASSWORD) ?? '',
    mysqlDatabase: maybeStr(process.env.WOLFGANG_MYSQL_DATABASE) ?? 'bsky',
    mysqlHost: maybeStr(process.env.WOLFGANG_MYSQL_HOST) ?? 'localhost',
    mysqlPort: maybeInt(process.env.WOLFGANG_MYSQL_PORT) ?? 3306,
    mysqlUser: maybeStr(process.env.WOLFGANG_MYSQL_USER) ?? '',
    mysqlPassword: maybeStr(process.env.WOLFGANG_MYSQL_PASSWORD) ?? '',
    subscriptionReconnectDelay:
      maybeInt(process.env.WOLFGANG_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
    subscriptionEndpoint:
      maybeStr(process.env.WOLFGANG_SUBSCRIPTION_ENDPOINT) ??
      'wss://bsky.social',
    hostname,
  })
  await server.start()
  console.log(
    `running Wolfgang at http://${server.cfg.listenhost}:${server.cfg.port}`,
  )
}

const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

run()
