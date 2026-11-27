import logging
logging.getLogger('chess.engine').setLevel(logging.ERROR)
import json, math, os, sys, chess, chess.engine
keep={'bricard','yusupov1','yusupov3','grooten','silman','iypp1','iypp2','hellsten','initiative','amateur','wcs'}
C=[x for x in json.load(open('candidates.json')) if x['book'] in keep]
OUT='analysis.jsonl'
done=set()
if os.path.exists(OUT):
    for l in open(OUT): done.add(json.loads(l)['id'])
def wp(s):
    if s.is_mate(): return 100.0 if s.mate()>0 else 0.0
    cp=s.score(); return 50+50*(2/(1+math.exp(-0.00368208*cp))-1)
VAL={1:1,2:3,3:3,4:5,5:9,6:0}
def mat(b,c): return sum(VAL[p.piece_type]*(1 if p.color==c else -1) for p in b.piece_map().values())
e=chess.engine.SimpleEngine.popen_uci('/usr/games/stockfish'); e.configure({'Threads':2,'Hash':256})
f=open(OUT,'a')
for i,x in enumerate(C):
    if x['id'] in done: continue
    b=chess.Board(x['fen']); me=b.turn
    r={'id':x['id']}
    try:
        info=e.analyse(b,chess.engine.Limit(depth=15),multipv=8)
        mv=[]
        for d in info:
            if 'pv' not in d: continue
            s=d['score'].pov(me); mv.append({'m':d['pv'][0].uci(),'wp':round(wp(s),1),'cp':s.score(mate_score=10000),'mate':s.mate(),'pv':[m.uci() for m in d['pv'][:8]]})
        if x['move'] not in [m['m'] for m in mv]:
            d=e.analyse(b,chess.engine.Limit(depth=16),root_moves=[chess.Move.from_uci(x['move'])])
            s=d['score'].pov(me); mv.append({'m':x['move'],'wp':round(wp(s),1),'cp':s.score(mate_score=10000),'mate':s.mate(),'pv':[m.uci() for m in d.get('pv',[])[:8]],'extra':1})
        r['moves']=mv
        # material swing along best pv
        bb=b.copy(); m0=mat(bb,me); sw=0
        for k,u in enumerate(mv[0]['pv'][:7]):
            bb.push(chess.Move.from_uci(u))
            if k>=1: sw=max(sw,mat(bb,me)-m0) if k%2==1 else sw
        r['swing']=mat(bb,me)-m0
        # other moves low depth when needed
        have=[m['m'] for m in mv]; best=mv[0]['wp']
        cands=[m for m in mv if 8<=best-m['wp']<=40]
        if len(cands)<3:
            low=[]
            for d in e.analyse(b,chess.engine.Limit(depth=10),multipv=40):
                if 'pv' not in d or d['pv'][0].uci() in have: continue
                s=d['score'].pov(me); low.append({'m':d['pv'][0].uci(),'wp':round(wp(s),1),'cp':s.score(mate_score=10000),'mate':s.mate(),'pv':[m.uci() for m in d['pv'][:6]],'low':1})
            r['low']=low
        # threat (null move)
        if not b.is_check():
            nb=b.copy(); nb.push(chess.Move.null())
            if nb.is_valid():
                d=e.analyse(nb,chess.engine.Limit(depth=12))
                s=d['score'].pov(me); r['threat']={'wp':round(wp(s),1),'pv':[m.uci() for m in d.get('pv',[])[:4]]}
    except Exception as ex:
        r['err']=str(ex)
    f.write(json.dumps(r)+'\n'); f.flush()
    if i%50==0: print(i,len(C),flush=True)
e.quit()
