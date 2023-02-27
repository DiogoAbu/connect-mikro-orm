/*!
 * Connect - MikroORM
 * Copyright(c) 2012 TJ Holowaychuk <tj@vision-media.ca>
 * Copyright(c) 2017, 2018 makepost <makepost@firemail.cc>
 * Copyright(c) 2018 Nathan Phillip Brink <ohnobinki@ohnopublishing.net>
 * Copyright(c) 2022 Gianmarco Rengucci <rengucci.gianmarco@gmail.com>
 * Copyright(c) 2023 Diogo Silva <diogodeazevedosilva@gmail.com>
 * MIT Licensed
 */

import * as Debug from 'debug';
import { SessionData, SessionOptions, Store } from 'express-session';
import { ISession } from '../../domain/Session/ISession';
import { SqlEntityRepository } from '@mikro-orm/knex';
import { parseJson } from '../../utils/parse-json';

/**
 * One day in seconds.
 */
const oneDay = 86400;

export type Ttl = number | ((store: MikroOrmStore, sess: SessionData, sid?: string) => number);

export class MikroOrmStore extends Store {
  private debug = Debug('connect:mikro-orm');
  private onError: ((s: MikroOrmStore, e: Error) => void) | undefined;
  private repository!: SqlEntityRepository<ISession>;
  private ttl: Ttl | undefined;

  /**
   * Initializes MikroOrmStore with the given `options`.
   */
  constructor(
    options: Partial<
      SessionOptions & {
        onError: (s: MikroOrmStore, e: Error) => void;
        ttl: Ttl;
      }
    > = {}
  ) {
    super();
    this.onError = options.onError;
    this.ttl = options.ttl;
  }

  public connect(repository: SqlEntityRepository<ISession>) {
    this.repository = repository;
    this.emit('connect');
    return this;
  }

  /**
   * Attempts to fetch session by the given `sid`.
   */
  public get = (sid: string, fn: (error?: Error | undefined, result?: SessionData) => void) => {
    this.debug('GET "%s"', sid);

    this.repository
      .findOne({ expiredAt: { $gt: Date.now() }, id: sid })
      .then((session) => {
        if (!session) {
          return fn();
        }

        this.debug('GOT %s', session.json);
        const result = parseJson<SessionData>(session.json);

        fn(undefined, result);
      })
      .catch((er: Error) => {
        fn(er);
        this.handleError(er);
      });
  };

  /**
   * Commits the given `sess` object associated with the given `sid`.
   */
  public set = (sid: string, sess: SessionData, fn?: (error?: Error) => void) => {
    let json: string;

    try {
      json = JSON.stringify(sess);
    } catch (er: unknown) {
      if (er instanceof Error) {
        return fn ? fn(er) : undefined;
      } else {
        return fn ? fn(new Error('serialize error')) : undefined;
      }
    }

    const ttl = this.getTTL(sess, sid);
    this.debug('SET "%s" %s ttl:%s', sid, json, ttl);

    // If a session with the given SID is already present (even deleted), renew it.
    // Else, create a new row/session.
    this.repository
      .upsert({
        id: sid,
        expiredAt: Date.now() + ttl * 1000,
        json,
      })
      .then(() => {
        this.debug('SET complete');

        if (fn) {
          fn();
        }
      })
      .catch((er) => {
        if (fn) {
          fn(er);
        }

        this.handleError(er);
      });
  };

  /**
   * Destroys the session associated with the given `sid`.
   */
  public destroy = (sid: string | string[], fn?: (error?: Error) => void) => {
    this.debug('DEL "%s"', sid);

    Promise.all(
      (Array.isArray(sid) ? sid : [sid]).map((x) => {
        this.repository.nativeDelete({ id: x });
      })
    )
      .then(() => {
        if (fn) {
          fn();
        }
      })
      .catch((er) => {
        if (fn) {
          fn(er);
        }

        this.handleError(er);
      });
  };

  /**
   * Refreshes the time-to-live for the session with the given `sid`.
   */
  public touch = (sid: string, sess: SessionData, fn?: (error?: Error) => void) => {
    const ttl = this.getTTL(sess);

    if (sess?.cookie?.expires) {
      this.debug('Skip updating session "%s" expiration', sid);
      if (fn) {
        fn();
      }
    }

    this.debug('EXPIRE "%s" ttl:%s', sid, ttl);
    this.repository
      .upsert({ id: sid, expiredAt: Date.now() + ttl * 1000 })
      .then(() => {
        this.debug('EXPIRE complete');

        if (fn) {
          fn();
        }
      })
      .catch((er) => {
        if (fn) {
          fn(er);
        }

        this.handleError(er);
      });
  };

  /**
   * Fetches all sessions.
   */
  public all = (fn: (error: Error | undefined, result: SessionData[]) => void) => {
    let result: SessionData[] = [];

    this.repository
      .findAll()
      .then((sessions) => {
        result = sessions.map((session) => {
          const sess = parseJson<SessionData>(session.json);
          sess.id = session.id;
          return sess;
        });

        fn(undefined, result);
      })
      .catch((er) => {
        fn(er, result);
        this.handleError(er);
      });
  };

  private getTTL(sess: SessionData, sid?: string) {
    if (typeof this.ttl === 'number') {
      return this.ttl;
    }
    if (typeof this.ttl === 'function') {
      return this.ttl(this, sess, sid);
    }

    const maxAge = sess.cookie.maxAge;
    return typeof maxAge === 'number' ? Math.floor(maxAge / 1000) : oneDay;
  }

  private handleError(er: Error) {
    this.debug('MikroOrm returned err', er);
    if (this.onError) {
      this.onError(this, er);
    } else {
      this.emit('disconnect', er);
    }
  }
}
