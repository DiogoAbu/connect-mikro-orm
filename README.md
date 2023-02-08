<div align="center">
  <h1>🔗 connect-mikro-orm</h1>
  <h3>A MikroORM-based session store.<h3><br/>

[![CodeFactor](https://www.codefactor.io/repository/github/DiogoAbu/connect-mikro-orm/badge)](https://www.codefactor.io/repository/github/DiogoAbu/connect-mikro-orm)
[![GitHub Repo stars](https://img.shields.io/github/stars/DiogoAbu/connect-mikro-orm)](https://github.com/DiogoAbu/connect-mikro-orm/stargazers)

</div>

## Setup & Usage

Configure MikroORM with back end of your choice:

### NPM

```bash
yarn add connect-mikro-orm @mikro-orm/core @mikro-orm/knex express-session
yarn add -D @types/express-session
```

## Implement the `Session` entity:

```typescript
// src/domain/Session/Session.ts

import type { ISession } from 'connect-mikro-orm';

import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class Session implements ISession {
  @PrimaryKey()
  id: string;

  @Property({ columnType: 'text' })
  json: string;

  @Index()
  @Property({ columnType: 'bigint' })
  expiredAt: number;
}
```

Pass repository to `MikroOrmStore`:

```typescript
// src/app/Api/Api.ts

import { MikroOrmStore } from 'connect-mikro-orm';
import * as Express from 'express';
import * as ExpressSession from 'express-session';

import { Session } from '../../domain/Session/Session';

export class Api {
  public sessionRepository = entityManager.getRepository(Session);

  public express = Express().use(
    ExpressSession({
      resave: false,
      saveUninitialized: false,
      store: new MikroOrmStore({
        ttl: 86400,
      }).connect(this.sessionRepository),
      secret: 'keyboard cat',
    })
  );
}
```

## Options

Constructor receives an object. Following properties may be included:

- `ttl` Session time to live (expiration) in seconds. Defaults to session.maxAge (if set), or one day. This may also be set to a function of the form `(store, sess, sessionID) => number`.

- `onError` Error handler for database exception. It is a function of the form `(store: MikroOrmStore, error: Error) => void`. If not set, any database error will cause the MikroOrmStore to be marked as "disconnected", and stop reading/writing to the database, therefore not loading sessions and causing all requests to be considered unauthenticated.

## License

MIT
