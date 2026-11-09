export async function functionErrorMessage(error, fallback) {
  const status=error?.context?.status;
  try {
    const response=error.context?.clone ? error.context.clone() : error.context;
    const body=await response?.json();
    if(typeof body?.error==='string')return body.error;
    if(typeof body?.message==='string')return body.message;
  } catch { /* Some gateway/network failures have no JSON response. */ }
  if(status===401 || status===403)return 'The cancellation request was not authorized. Refresh the page and try again.';
  if(status===404)return 'The cancellation service is unavailable. Please contact the restaurant.';
  if(error?.name==='FunctionsFetchError' || error?.name==='FunctionsRelayError')return 'Could not reach the cancellation service. Check your connection and try again.';
  return fallback;
}
