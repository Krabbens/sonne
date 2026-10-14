export class RequestError extends Error {
  constructor(message, status = 0) {super(message); this.status = status;}
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function retryRequest(operation, {retry, wait = pause}) {
  for (let attempt = 0; ; attempt++) {
    try {return await operation();}
    catch (error) {
      if (error instanceof RequestError) throw error;
      const interrupted = error instanceof TypeError || error.name === 'AbortError';
      if (interrupted && retry && attempt < 2) {await wait([500,1500][attempt]); continue;}
      throw new RequestError(interrupted ? 'Connection to Sonne was interrupted. Your draft is still open. Try again when the server is available.' : 'Sonne returned an incomplete response. Your draft is still open. Try again.');
    }
  }
}

export function requestResponse(url, options = {}, config = {}) {
  const {fetchImpl = globalThis.fetch, retry = !options.method || options.method === 'GET', wait} = config;
  return retryRequest(() => fetchImpl(url,options), {retry,wait});
}

export function requestJSON(url, options = {}, config = {}) {
  const {fetchImpl = globalThis.fetch, retry = !options.method || options.method === 'GET', wait} = config;
  return retryRequest(async () => {
    const response = await fetchImpl(url,options);
    let data;
    try {data = await response.json();}
    catch (error) {
      if (error instanceof TypeError) throw error;
      throw new RequestError('Sonne returned an incomplete response. Your draft is still open. Try again.', response.status);
    }
    if (!response.ok) throw new RequestError(data.error || 'The request could not be completed.',response.status);
    return data;
  }, {retry,wait});
}
