#!/usr/bin/env python3
"""Bake OpenStreetMap data for central Helsinki into helsinki.js (map data © OpenStreetMap contributors, ODbL).

Usage: python3 tools/bake_helsinki.py [raw.json]
Without an argument it downloads from Overpass. Output: helsinki.js next to index.html.
Coordinates are game px: 16 px per metre, x east, y south, (0, 0) at the north-west corner,
Helsinki Central Station in the middle.
"""
import json, math, sys, os, urllib.request, urllib.parse, zlib

LAT0, LON0 = 60.1720965, 24.9412486      # Helsinki Central Station (railway=station node)
PPM = 16                                   # px per metre: the game's houses, people and robots were drawn at this scale
HALF_X, HALF_Y = 800, 760                  # metres from the station: Kamppi in the west, Kruununhaka in the east
W, H = 2 * HALF_X * PPM, 2 * HALF_Y * PPM
MX = 111320 * math.cos(math.radians(LAT0)) * PPM
MY = 110574 * PPM

def P(lat, lon): return ((lon - LON0) * MX + W / 2, (LAT0 - lat) * MY + H / 2)

QUERY = """[out:json][timeout:180];
(
 way["highway"]({b}); way["building"]({b}); relation["building"]({b});
 way["natural"="water"]({b}); relation["natural"="water"]({b}); way["natural"="coastline"]({b});
 way["leisure"~"^(park|garden)$"]({b}); relation["leisure"="park"]({b}); way["landuse"="grass"]({b});
 way["railway"~"^(rail|tram|platform)$"]({b}); way["man_made"="pier"]({b});
)->.a;
.a out body; .a >; out skel qt;
(
 node["natural"="tree"]({b}); node["entrance"]({b}); node["highway"~"^(crossing|street_lamp)$"]({b});
 node["addr:housenumber"]({b}); nwr["brand"~"^(Alepa|S-market)$"]({b});
);
out center tags;"""

def fetch():
    m = 120 / 111000
    b = f"{LAT0 - HALF_Y / 110574 - m},{LON0 - HALF_X / (MX / PPM) - m * 2},{LAT0 + HALF_Y / 110574 + m},{LON0 + HALF_X / (MX / PPM) + m * 2}"
    data = urllib.parse.urlencode({'data': QUERY.format(b=b)}).encode()
    for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']:
        try:
            req = urllib.request.Request(url, data, headers={'User-Agent': 'osm-bake-script/1.0'})
            return json.load(urllib.request.urlopen(req, timeout=200))
        except Exception as e:
            print('overpass failed:', url, e, file=sys.stderr)
    sys.exit('no overpass server answered')

raw = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else fetch()
nodes, ways, rels, tagged = {}, [], [], []
for e in raw['elements']:
    if e['type'] == 'node':
        if 'lat' in e: nodes[e['id']] = P(e['lat'], e['lon'])
        if e.get('tags'): tagged.append(e)
    elif e['type'] == 'way': ways.append(e)
    else: rels.append(e)
wayById = {w['id']: w for w in ways}
ntags = {e['id']: e['tags'] for e in tagged}

def inside(x, y, m=0): return -m <= x <= W + m and -m <= y <= H + m
def pts(w): return [nodes[n] for n in w['nodes'] if n in nodes]
def near_map(ps, m=800): return any(inside(x, y, m) for x, y in ps)
def num(v, d=None):
    try: return float(str(v).split(';')[0].replace(',', '.').split()[0])
    except Exception: return d

def dp(ps, ids, keep, tol):  # Douglas-Peucker that never drops a node in `keep` (junctions, entrances)
    if len(ps) < 3: return list(range(len(ps)))
    fixed = [0] + [i for i in range(1, len(ps) - 1) if ids[i] in keep] + [len(ps) - 1]
    if ids[0] == ids[-1]:  # a ring: its two ends are one point, so pin the far side too
        fixed = sorted(set(fixed) | {max(range(len(ps)), key=lambda i: math.hypot(ps[i][0] - ps[0][0], ps[i][1] - ps[0][1]))})
    out = []
    for a, b in zip(fixed, fixed[1:]):
        stack, mark = [(a, b)], {a, b}
        while stack:
            i, j = stack.pop()
            (x1, y1), (x2, y2) = ps[i], ps[j]
            L = math.hypot(x2 - x1, y2 - y1) or 1e-9
            best, bk = 0, -1
            for k in range(i + 1, j):
                d = abs((x2 - x1) * (y1 - ps[k][1]) - (x1 - ps[k][0]) * (y2 - y1)) / L
                if d > best: best, bk = d, k
            if best > tol: mark.add(bk); stack += [(i, bk), (bk, j)]
        out += sorted(mark)[:-1]
    out.append(len(ps) - 1)
    return sorted(set(out))

def flat(ps): return [round(v) for p in ps for v in p]
def area2(ps): return sum(ps[i][0] * ps[i - 1][1] - ps[i - 1][0] * ps[i][1] for i in range(len(ps)))

def underground(t):
    return t.get('tunnel') in ('yes', 'culvert') or num(t.get('layer'), 0) < 0 or t.get('indoor') == 'yes' \
        or t.get('location') == 'underground' or t.get('level', '0').startswith('-')

# ---------- streets ----------
CAR_W = {'primary': 12, 'secondary': 10, 'tertiary': 9, 'residential': 7, 'unclassified': 6.5, 'living_street': 6, 'service': 4.5}
WALK_W = {'footway': 3, 'pedestrian': 6, 'path': 2.5, 'cycleway': 2.5, 'steps': 3, 'platform': 4, 'track': 3, 'bridleway': 2.5}
hw = [w for w in ways if 'highway' in w.get('tags', {}) and not underground(w['tags'])
      and w['tags'].get('tunnel') != 'building_passage' and near_map(pts(w))]
use = {}
for w in hw:
    for n in w['nodes']: use[n] = use.get(n, 0) + 1
keep = {n for n, c in use.items() if c > 1} | {e['id'] for e in tagged if e['tags'].get('highway') == 'crossing'}
roads, walks, areas = [], [], []
for w in hw:
    t, ids = w['tags'], [n for n in w['nodes'] if n in nodes]
    k = t['highway'].replace('_link', '')
    ps = [nodes[n] for n in ids]
    if len(ps) < 2: continue
    closed = ids[0] == ids[-1]
    if k == 'pedestrian' and closed and t.get('area') != 'no':  # squares: Rautatientori, Narinkka
        areas.append(flat(ps)); continue
    if t.get('area') == 'yes': continue
    keepi = dp(ps, ids, keep, 0.4 * PPM)
    ps = [ps[i] for i in keepi]
    if k in CAR_W:
        lanes = num(t.get('lanes'))
        oneway = t.get('oneway') in ('yes', '1', 'true') or t.get('junction') == 'roundabout'
        wid = lanes * 3.2 + (0.6 if oneway else 1.2) if lanes else CAR_W[k] * (.65 if oneway else 1)
        car = k != 'service' and t.get('access') not in ('no', 'private') and t.get('motor_vehicle') != 'no'
        roads.append([round(min(wid, 16) * PPM), (1 if car else 0) | (2 if oneway else 0) | (4 if t.get('oneway') == '-1' else 0)] + flat(ps))
    elif k in WALK_W:
        wid = WALK_W[k] + (.5 if t.get('footway') == 'sidewalk' else 0)
        walks.append([round(wid * PPM)] + flat(ps))

rails = []
for w in ways:
    t = w.get('tags', {})
    if t.get('railway') in ('rail', 'tram') and not underground(t) and near_map(pts(w)):
        ps = pts(w); ids = [n for n in w['nodes'] if n in nodes]
        rails.append([1 if t['railway'] == 'tram' else 0] + flat([ps[i] for i in dp(ps, ids, set(), 0.4 * PPM)]))
    elif t.get('railway') == 'platform' and not underground(t) and near_map(pts(w)):
        ps = pts(w)
        if w['nodes'][0] == w['nodes'][-1]: areas.append(flat(ps))
        else: walks.append([round(4 * PPM)] + flat(ps))

# ---------- buildings ----------
def bheight(t):
    h = num(t.get('height'))
    if h: return h
    lv = num(t.get('building:levels'))
    if lv: return lv * 3.2 + 1.5
    return {'shed': 3, 'kiosk': 3, 'greenhouse': 3.5, 'service': 4, 'garage': 3.5, 'church': 24, 'cathedral': 40}.get(t.get('building'), 18)

SKIP_B = {'roof', 'construction', 'carport', 'no', 'ruins', 'canopy', 'bridge'}
ENTR = {e['id'] for e in tagged if 'entrance' in e['tags']}
buildings, bmeta = [], []   # bmeta: (tags, outline node ids) for door finding
def add_building(ids, t):
    ids = [n for n in ids if n in nodes]
    if len(ids) < 4 or ids[0] != ids[-1]: return
    ps = [nodes[n] for n in ids]
    if not near_map(ps, 100): return
    keepi = dp(ps, ids, ENTR, 0.25 * PPM)
    ids = [ids[i] for i in keepi]; ps = [nodes[n] for n in ids]
    if len(ps) < 4 or abs(area2(ps)) < (3 * PPM) ** 2: return
    if area2(ps[:-1]) < 0: ids, ps = ids[::-1], ps[::-1]   # one winding for everyone: positive shoelace sum
    buildings.append([round(bheight(t) * PPM)] + flat(ps[:-1]))
    bmeta.append((t, ids))

for w in ways:
    t = w.get('tags', {})
    if 'building' in t and t['building'] not in SKIP_B and not underground(t):
        add_building(w['nodes'], t)
for r in rels:
    t = r.get('tags', {})
    if 'building' in t and t['building'] not in SKIP_B and not underground(t):
        for m in r['members']:
            if m['type'] == 'way' and m.get('role') == 'outer' and m['ref'] in wayById:
                add_building(wayById[m['ref']]['nodes'], {**wayById[m['ref']].get('tags', {}), **t})

# ---------- water, parks ----------
water, coast, seeds, parks, piers = [], [], [], [], []
for w in ways:
    t, ps = w.get('tags', {}), pts(w)
    if not near_map(ps, 200) or len(ps) < 2: continue
    if t.get('natural') == 'water' and w['nodes'][0] == w['nodes'][-1] and not underground(t): water.append(flat(ps))
    elif t.get('natural') == 'coastline':
        coast.append(flat(ps))
        for i in range(0, len(ps) - 1, 6):  # OSM coastlines keep the land on the left: the sea is 3 m to the right
            (x1, y1), (x2, y2) = ps[i], ps[i + 1]
            L = math.hypot(x2 - x1, y2 - y1)
            if L < 2 * PPM: continue
            sx, sy = (x1 + x2) / 2 - (y2 - y1) / L * 3 * PPM, (y1 + y2) / 2 + (x2 - x1) / L * 3 * PPM  # y is south: right of travel
            if inside(sx, sy): seeds += [round(sx), round(sy)]
    elif t.get('man_made') == 'pier' and w['nodes'][0] == w['nodes'][-1]: piers.append(flat(ps))
    elif (t.get('leisure') in ('park', 'garden') or t.get('landuse') == 'grass') and w['nodes'][0] == w['nodes'][-1]: parks.append(flat(ps))
for r in rels:
    if r.get('tags', {}).get('leisure') == 'park':
        for m in r['members']:
            if m['type'] == 'way' and m.get('role') == 'outer' and m['ref'] in wayById:
                w = wayById[m['ref']]
                if w['nodes'][0] == w['nodes'][-1]: parks.append(flat(pts(w)))

# ---------- point features ----------
trees, lamps, crossings = [], [], []
for e in tagged:
    t = e['tags']
    if 'lat' not in e: continue
    x, y = P(e['lat'], e['lon'])
    if not inside(x, y): continue
    if t.get('natural') == 'tree': trees += [round(x), round(y)]
    elif t.get('highway') == 'street_lamp': lamps += [round(x), round(y)]
    elif t.get('highway') == 'crossing' and use.get(e['id'], 0): crossings += [round(x), round(y)]

# ---------- shops and delivery doors ----------
def seg_closest(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    L2 = dx * dx + dy * dy or 1e-9
    u = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / L2))
    return x1 + u * dx, y1 + u * dy

def pip(x, y, ps):
    c = False
    for i in range(len(ps)):
        (x1, y1), (x2, y2) = ps[i - 1], ps[i]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c

bpolys = [[(b[i], b[i + 1]) for i in range(1, len(b), 2)] for b in buildings]
bbox = [(min(p[0] for p in ps), min(p[1] for p in ps), max(p[0] for p in ps), max(p[1] for p in ps)) for ps in bpolys]
def in_building(x, y, m=0):
    return any(b[0] - m <= x <= b[2] + m and b[1] - m <= y <= b[3] + m and pip(x, y, bpolys[i]) for i, b in enumerate(bbox))

def facade(x, y):  # nearest building wall to (x, y): the door 1.2 m outside it, and the outward normal
    best = None
    for i, b in enumerate(bbox):
        if not (b[0] - 40 * PPM <= x <= b[2] + 40 * PPM and b[1] - 40 * PPM <= y <= b[3] + 40 * PPM): continue
        ps = bpolys[i]
        for k in range(len(ps)):
            (x1, y1), (x2, y2) = ps[k - 1], ps[k]
            cx, cy = seg_closest(x, y, x1, y1, x2, y2)
            d = math.hypot(cx - x, cy - y)
            if best is None or d < best[0]:
                L = math.hypot(x2 - x1, y2 - y1) or 1
                best = (d, cx, cy, -(y2 - y1) / L, (x2 - x1) / L)  # outward for the positive winding, y south
    if not best: return None
    _, cx, cy, nx, ny = best
    return cx + nx * 1.2 * PPM, cy + ny * 1.2 * PPM, nx, ny

walkseg = []
for r in roads: walkseg += [(r[i], r[i + 1], r[i + 2], r[i + 3]) for i in range(2, len(r) - 3, 2)]
for r in walks: walkseg += [(r[i], r[i + 1], r[i + 2], r[i + 3]) for i in range(1, len(r) - 3, 2)]
def street_dist(x, y):
    m = 30 * PPM
    return min((math.dist(seg_closest(x, y, *s), (x, y)) for s in walkseg
                if min(s[0], s[2]) - m < x < max(s[0], s[2]) + m and min(s[1], s[3]) - m < y < max(s[1], s[3]) + m), default=1e9)

shops = []
for e in tagged:
    t = e['tags']
    if t.get('brand') not in ('Alepa', 'S-market'): continue
    lat, lon = (e['lat'], e['lon']) if 'lat' in e else (e['center']['lat'], e['center']['lon'])
    x, y = P(lat, lon)
    if not inside(x, y, -30 * PPM): continue
    f = facade(x, y)
    if f: shops.append([t['brand'], t.get('addr:street', ''), t.get('addr:housenumber', ''), round(f[0]), round(f[1]), round(f[2], 3), round(f[3], 3)])
sx0, sy0 = W / 2, H / 2
shops.sort(key=lambda s: math.hypot(s[3] - sx0, s[4] - sy0))  # shop 0 is the one by the station: robots start there

# candidate doors: entrances with a street address, on a building outline, a street within 25 m
cands, seen = [], set()
nodeb = {}
for bi, (t, ids) in enumerate(bmeta):
    for k, n in enumerate(ids[:-1]): nodeb[n] = (bi, k)
RANK = {'main': 0, 'yes': 1, 'staircase': 2, 'home': 2, 'secondary': 3}
ents = sorted((e for e in tagged if e['tags'].get('entrance') in RANK and e['id'] in nodeb), key=lambda e: RANK[e['tags']['entrance']])
for e in ents:
    t = e['tags']; bi, k = nodeb[e['id']]; bt, ids = bmeta[bi]
    street, no = t.get('addr:street') or bt.get('addr:street'), t.get('addr:housenumber') or bt.get('addr:housenumber')
    if not street or not no or (street, no) in seen: continue
    if bt.get('building') not in ('apartments', 'residential', 'yes', 'house', 'dormitory', 'terrace'): continue
    ps = bpolys[bi]; x, y = nodes[e['id']]
    (x1, y1), (x2, y2) = ps[k - 1], ps[(k + 1) % len(ps)]   # the walls either side of the door node
    L = math.hypot(x2 - x1, y2 - y1) or 1
    nx, ny = -(y2 - y1) / L, (x2 - x1) / L
    dx, dy = x + nx * 1.2 * PPM, y + ny * 1.2 * PPM
    if not inside(dx, dy, -40 * PPM) or in_building(dx, dy) or street_dist(dx, dy) > 25 * PPM: continue
    seen.add((street, no))
    cands.append([street, no.split(';')[0], round(dx), round(dy), round(nx, 3), round(ny, 3)])

# 7 doors per shop, 70-330 m away, spread out; deterministic so every client agrees on house indexes
cands.sort(key=lambda c: zlib.crc32(f'{c[0]} {c[1]}'.encode()))
houses = []
for s in shops:
    mine = []
    for c in cands:
        d = math.hypot(c[2] - s[3], c[3] - s[4])
        if 70 * PPM < d < 330 * PPM and all(math.hypot(c[2] - h[2], c[3] - h[3]) > 55 * PPM for h in houses + mine):
            mine.append(c)
        if len(mine) == 7: break
    houses += mine

# the kids' home: an apartment door facing the frozen sea; the ice-swimming hole out on the ice in front of it (the game puts the sauna beside it)
coastsegs = [(c[i], c[i + 1], c[i + 2], c[i + 3]) for c in coast for i in range(0, len(c) - 3, 2)]
def shore(x, y):
    best = None
    for s in coastsegs:
        cx, cy = seg_closest(x, y, *s); d = math.hypot(cx - x, cy - y)
        if best is None or d < best[0]:
            L = math.hypot(s[2] - s[0], s[3] - s[1]) or 1
            best = (d, cx, cy, -(s[3] - s[1]) / L, (s[2] - s[0]) / L)
    return best
kid = min((c for c in cands if inside(c[2], c[3], -60 * PPM)), key=lambda c: shore(c[2], c[3])[0])
if kid not in houses: houses.insert(min(2, len(houses)), kid)
kids_home = houses.index(kid)
_, cx, cy, nx, ny = shore(kid[2], kid[3])
avanto = [round(cx + nx * 30 * PPM), round(cy + ny * 30 * PPM)]

# Olli Lindholm's statue in the biggest park on the map
def pa(p): return abs(area2([(p[i], p[i + 1]) for i in range(0, len(p), 2)]))
park = max((p for p in parks if all(inside(p[i], p[i + 1]) for i in range(0, len(p), 2))), key=pa)
pps = [(park[i], park[i + 1]) for i in range(0, len(park), 2)]
statue = None
cxm, cym = sum(p[0] for p in pps) / len(pps), sum(p[1] for p in pps) / len(pps)
for r in range(0, 120 * PPM, 2 * PPM):  # spiral out from the park's middle to a spot clear of paths
    for a in range(0, 360, 20):
        x, y = cxm + r * math.cos(math.radians(a)), cym + r * math.sin(math.radians(a))
        if pip(x, y, pps) and street_dist(x, y) > 9 * PPM and not in_building(x, y, 6 * PPM): statue = [round(x), round(y)]; break
    if statue: break

out = dict(W=W, H=H, ppm=PPM, center=[LAT0, LON0], roads=roads, walks=walks, areas=areas, rails=rails, buildings=buildings,
           water=water, coast=coast, seaSeeds=seeds, parks=parks, piers=piers, trees=trees, lamps=lamps, crossings=crossings,
           shops=shops, houses=houses, kidsHome=kids_home, avanto=avanto, statue=statue)
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'helsinki.js')
with open(dst, 'w') as f:
    f.write('// Central Helsinki for Ruokarobo. Map data © OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright).\n')
    f.write('// Generated by tools/bake_helsinki.py; edit that, not this.\n')
    f.write('window.HKI=' + json.dumps(out, separators=(',', ':'), ensure_ascii=False) + ';\n')
print(f'{dst}: {os.path.getsize(dst) // 1024} KB, {len(roads)} roads, {len(walks)} walks, {len(buildings)} buildings, '
      f'{len(trees) // 2} trees, {len(lamps) // 2} lamps, {len(shops)} shops, {len(houses)} houses (of {len(cands)} doors)')
for s in shops: print('  shop', s[:3])
print('  kids home', houses[kids_home][:2], 'avanto', avanto, 'statue', statue)
