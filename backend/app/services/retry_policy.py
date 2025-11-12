import os
import time
import httpx
from typing import Callable, Any, List
from functools import wraps

DEFAULT_MAX_ATTEMPTS = int(os.getenv("OSM_RETRY_ATTEMPTS", "3"))
DEFAULT_BACKOFF_MS = [int(x) for x in os.getenv("OSM_BACKOFF_MS", "300,800,1500").split(",")]


def with_retry(
    func: Callable,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    backoff_ms: List[int] = DEFAULT_BACKOFF_MS
) -> Any:
    """Führt eine Funktion mit Retry-Logik aus"""
    last_exception = None
    
    for attempt in range(max_attempts):
        try:
            return func()
        except (httpx.HTTPError, httpx.TimeoutException, httpx.ConnectError) as e:
            last_exception = e
            if attempt < max_attempts - 1:
                # Backoff vor nächstem Versuch
                backoff = backoff_ms[min(attempt, len(backoff_ms) - 1)]
                time.sleep(backoff / 1000.0)
            continue
        except Exception as e:
            # Andere Exceptions nicht retryen
            raise e
    
    # Alle Versuche fehlgeschlagen
    if last_exception:
        raise last_exception
    raise Exception("Retry failed without exception")


def retry_decorator(max_attempts: int = DEFAULT_MAX_ATTEMPTS, backoff_ms: List[int] = DEFAULT_BACKOFF_MS):
    """Decorator für Funktionen mit Retry-Logik"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            def call_func():
                return func(*args, **kwargs)
            return with_retry(call_func, max_attempts, backoff_ms)
        return wrapper
    return decorator

