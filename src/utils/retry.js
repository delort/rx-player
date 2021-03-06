import { getBackedoffDelay } from "./backoff";
import { TimerObservable } from "rxjs/observable/TimerObservable";

const timer = TimerObservable.create;

/**
 * Simple debounce implementation.
 * @param {Function} fn
 * @param {Number} delay
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer = 0;
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(fn, delay);
  };
}

/**
 * @param {Observable} obs
 * @param {Object} options
 * @param {Number} options.retryDelay
 * @param {Number} options.totalRetry
 * @param {Number} options.resetDelay
 * @param {Function} [options.shouldRetry]
 * @param {Function} [options.errorSelector]
 * @param {Function} [options.onRetry]
 * @returns {Observable}
 */
function retryWithBackoff(obs, options) {
  const {
    retryDelay,
    totalRetry,
    shouldRetry,
    resetDelay,
    errorSelector,
    onRetry,
  } = options;

  let retryCount = 0;
  let debounceRetryCount;
  if (resetDelay > 0) {
    debounceRetryCount = debounce(() => retryCount = 0, resetDelay);
  }

  return obs.catch((error, source) => {
    const wantRetry = !shouldRetry || shouldRetry(error);
    if (!wantRetry || retryCount++ >= totalRetry) {
      if (errorSelector) {
        throw errorSelector(error, retryCount);
      } else {
        throw error;
      }
    }

    if (onRetry) {
      onRetry(error, retryCount);
    }

    const fuzzedDelay = getBackedoffDelay(retryDelay, retryCount);
    return timer(fuzzedDelay).mergeMap(() => {
      debounceRetryCount && debounceRetryCount();
      return source;
    });
  });
}

/**
 * @param {Function} fn - Function returning an Observable which
 * will (well, might) me retried.
 * @param {Object} options
 * @param {Number} options.retryDelay
 * @param {Number} options.totalRetry
 * @param {Number} options.resetDelay
 * @param {Function} [options.shouldRetry]
 * @param {Function} [options.errorSelector]
 * @param {Function} [options.onRetry]
 * @returns {Function} - take in argument fn's arguments, returns
 * an Observable.
 */
function retryableFuncWithBackoff(fn, options) {
  const {
    retryDelay,
    totalRetry,
    shouldRetry,
    resetDelay,
    errorSelector,
    onRetry,
  } = options;

  let retryCount = 0;
  let debounceRetryCount;
  if (resetDelay > 0) {
    debounceRetryCount = debounce(() => retryCount = 0, resetDelay);
  }

  return function doRetry(...args) {
    return fn(...args).catch((error) => {
      const wantRetry = !shouldRetry || shouldRetry(error);
      if (!wantRetry || retryCount++ >= totalRetry) {
        if (errorSelector) {
          throw errorSelector(error, retryCount);
        } else {
          throw error;
        }
      }

      if (onRetry) {
        onRetry(error, retryCount);
      }

      const fuzzedDelay = getBackedoffDelay(retryDelay, retryCount);
      return timer(fuzzedDelay).mergeMap(() => {
        debounceRetryCount && debounceRetryCount();
        return doRetry(...args);
      });
    });
  };
}

export {
  retryWithBackoff,
  retryableFuncWithBackoff,
};
