export type JWTObject = {
  sub: string;
  name: string;
  email: string;
  iat: number;
  exp: number;
};

export type JWTUser = {
  id: string;
  name: string;
  email: string;
};
