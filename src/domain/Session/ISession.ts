export interface ISession {
  id: string;
  json: string | Record<string, unknown>;
  expiredAt: number;
}
