import { DefaultContext, ExtendedRequest } from "lw-test-module";
import type { Response } from "express";

function handler<Context extends DefaultContext = DefaultContext>(
    _req: ExtendedRequest<Context>,
    res: Response,
  ) {
    const url: URL = new URL(_req.url, `${_req.protocol}://${_req.headers.host}`);
  res
    .status(200)
    .json({
      status: 'OK',
      request: {
        method: _req.method,
        url: {
          path: url.pathname,
          query: url.searchParams,
        },
        protocol: url.protocol,
        http: {
          major: _req.httpVersionMajor,
          minor: _req.httpVersionMinor,
        },
        host: {
          name: url.hostname,
          port: url.port,
        },
        headers: _req.headersDistinct,
        body: _req.body,
      },
    })
    .send();
}

export default handler;