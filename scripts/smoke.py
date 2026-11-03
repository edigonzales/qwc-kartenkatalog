#!/usr/bin/env python3
"""HTTP contract for a running Compose stack; no third-party dependencies."""
import argparse
import json
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8082')
args = parser.parse_args()
base = args.url.rstrip('/')


def get(route):
    with urllib.request.urlopen(base + route, timeout=30) as response:
        return response.status, response.headers, response.read()


assert json.loads(get('/healthz')[2])['status'] == 'UP'
html = get('/map/')[2].decode()
assert 'dist/QWC2App.js' in html and 'matomo.js' not in html
assert 'javascript' in get('/map/dist/QWC2App.js')[1]['Content-Type']
assert 'text/css' in get('/map/assets/css/qwc2.css')[1]['Content-Type']
catalog = json.loads(get('/catalog-api/v1/catalog')[2])
assert catalog['themes'] and any(entry['layers'] for entry in catalog['themes'])
assert len(catalog['themes']) == 169
assert sum(len(entry['layers']) for entry in catalog['themes']) == 886
assert all(layer['organization'] for entry in catalog['themes'] for layer in entry['layers'])
hoheitsgrenzen = next(entry['theme'] for entry in catalog['themes'] if entry['theme']['identifier'] == 'harvest-hoheitsgrenzen')
assert hoheitsgrenzen['dataOwner'] == 'Amt für Geoinformation'
assert hoheitsgrenzen['contact'] == 'mailto:agi@bd.so.ch'

# The shared adapter must still be active in the packaged application.
config = json.loads(get('/map/config.json?lang=de-CH')[2])
assert (config.get('startupTask') or {}).get('key') != 'Kartenkatalog'
for device in ['desktop', 'mobile']:
    plugins = config['plugins'][device]
    assert any(p['name'] == 'Kartenkatalog' for p in plugins)
    assert any(item.get('key') == 'Kartenkatalog'
               for p in plugins if p['name'] == 'TopBar'
               for item in p.get('cfg', {}).get('menuItems', []))
assert not any(p['name'] in ('Editing', 'Authentication') for p in config['plugins']['desktop'])
assert 'themes' in json.loads(get('/map/themes.json')[2])
for route in ['/auth/info', '/catalog-api/actuator/env', '/map/editConfig.json']:
    try:
        get(route)
        raise AssertionError('Blocked route accepted: ' + route)
    except urllib.error.HTTPError as error:
        assert error.code == 403, (route, error.code)
print('Compose smoke passed: health, local assets, catalog, live config, blocked routes')
