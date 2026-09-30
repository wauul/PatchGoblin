"""Rate response fixtures; no provider calls are made here."""
import httpx
import pytest
from worker.github import GitHub, GitHubRateLimit, rate_limit_delay


def test_primary_limit_uses_server_reset(monkeypatch):
    monkeypatch.setattr('worker.github.time.time',lambda:100)
    assert rate_limit_delay(httpx.Response(403,headers={'x-ratelimit-remaining':'0','x-ratelimit-reset':'900'}))==801


def test_secondary_limit_does_not_retry_before_retry_after():
    requests=[]
    def response(req):
        requests.append(req)
        return httpx.Response(403,headers={'retry-after':'120'},json={'message':'secondary rate limit'})
    github=GitHub(token='explicit-unit-fixture')
    github.client.close()
    github.client=httpx.Client(base_url='https://api.github.com',transport=httpx.MockTransport(response))
    with pytest.raises(GitHubRateLimit) as error:
        github.request('GET','/repos/owner/repo')
    assert error.value.retry_after==120 and len(requests)==1
    github.client.close()


def test_permission_denial_is_not_retried_as_rate_limit():
    assert rate_limit_delay(httpx.Response(403,json={'message':'Resource not accessible by integration'})) is None
