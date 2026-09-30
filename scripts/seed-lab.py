"""Create/update only the explicitly named disposable seeded lab. No credentials are printed."""
import json
from pathlib import Path
from worker.github import GitHub
from worker.project import make_workflow

env = dict(line.split("=", 1) for line in Path(".env").read_text().splitlines() if "=" in line)
gh = GitHub(env["GITHUB_TOKEN"])
repo = "wauul/patchgoblin-lab"
main = gh.request("GET", f"/repos/{repo}/commits/main")
weather = '''import requests


def forecast_request(latitude, longitude):
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Coordinates out of range")
    return requests.Request("GET", "https://api.open-meteo.com/v1/forecast", params={"latitude": latitude, "longitude": longitude, "hourly": "temperature_2m"}).prepare()


def fahrenheit(celsius):
    return celsius * 9 / 5 + 32
'''
tests = '''import pytest
from weather import forecast_request, fahrenheit


def test_forecast_request_contains_coordinates():
    request = forecast_request(48.85, 2.35)
    assert request.method == "GET"
    assert "latitude=48.85" in request.url
    assert "longitude=2.35" in request.url
    assert "hourly=temperature_2m" in request.url


@pytest.mark.parametrize("latitude,longitude", [(91, 0), (0, 181)])
def test_invalid_coordinates_rejected(latitude, longitude):
    with pytest.raises(ValueError):
        forecast_request(latitude, longitude)


@pytest.mark.parametrize("celsius,expected", [(0,32), (100,212), (-40,-40)])
def test_temperature_conversion(celsius, expected):
    assert fahrenheit(celsius) == expected
'''
files = {"README.md":"# PatchGoblin seeded lab\n\nThis is labeled demo data: a small Python weather request library with real offline tests.\n\n`main` has no CI (builder fixture). `broken-install` has an intentional requests/urllib3 constraint conflict (repair fixture).\n\nRun: `python -m pip install -r requirements.txt`, then `python -m pytest`.\nNo network request is made by the tests.\n",
         "requirements.txt":"requests==2.32.3\npytest==8.3.5\n", "weather.py":weather, "tests/test_weather.py":tests,
         ".gitignore":".venv/\n__pycache__/\n.pytest_cache/\n"}
tree = gh.request("POST", f"/repos/{repo}/git/trees", json={"base_tree":main["commit"]["tree"]["sha"],"tree":[{"path":p,"mode":"100644","type":"blob","content":c} for p,c in files.items()]})
commit = gh.request("POST", f"/repos/{repo}/git/commits", json={"message":"Seed a tested Python project without CI", "tree":tree["sha"], "parents":[main["sha"]]})
gh.request("PATCH", f"/repos/{repo}/git/refs/heads/main", json={"sha":commit["sha"]})
broken = {"requirements.txt":"requests==2.32.3\nurllib3==1.20\npytest==8.3.5\n", ".github/workflows/ci.yml":make_workflow({"python":"3.11","manager":"pip","files":files,"install":"python -m pip install -r requirements.txt","checks":["python -m pytest"]})}
tree = gh.request("POST", f"/repos/{repo}/git/trees", json={"base_tree":tree["sha"],"tree":[{"path":p,"mode":"100644","type":"blob","content":c} for p,c in broken.items()]})
broken_commit = gh.request("POST", f"/repos/{repo}/git/commits", json={"message":"Seed an intentional dependency resolver conflict", "tree":tree["sha"], "parents":[commit["sha"]]})
gh.request("POST", f"/repos/{repo}/git/refs", json={"ref":"refs/heads/broken-install", "sha":broken_commit["sha"]})
print(json.dumps({"repo":repo,"builder_sha":commit["sha"],"repair_sha":broken_commit["sha"]}))
