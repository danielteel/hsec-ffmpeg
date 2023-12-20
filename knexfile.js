module.exports = {
    development: {
      client: 'postgresql',
      connection: {
        host: '127.0.0.1',
        port: 5432,
        database: process.env.DB_DB,
        user:     process.env.DB_USER,
        password: process.env.DB_PASS
      },
    }
  }