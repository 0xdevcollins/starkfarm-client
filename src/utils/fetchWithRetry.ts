import { getHosturl } from '@/utils';

async function fetchWithRetry(
  url: string,
  options: any = {},
  errorToast: string = 'Failed to fetch',
): Promise<Response | null> {
  const maxRetries = 3;
  const delay = 1000;

  const urlPrefix =
    typeof window === 'undefined' && !url.includes('http')
      ? process.env.HOSTNAME || `https://app.${getHosturl()}`
      : '';

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${urlPrefix}${url}`, options);
      if (response.ok) {
        return response;
      }
      throw new Error(`Failed to fetch ${url}, ${response.statusText}`, {
        cause: response.status,
      });
    } catch (error) {
      if (i === maxRetries - 1) {
        console.error(`Error fetching ${url} : `, error);
        // toast.error(errorToast, {
        //   position: 'bottom-right',
        // });
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return null;
}

export default fetchWithRetry;
