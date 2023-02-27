import { ISession } from '../domain/Session/ISession';

export const parseJson = <T>(json: ISession['json']): T => {
  return typeof json === 'string' ? JSON.parse(json) : json;
};
