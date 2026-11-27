import json, sys, hashlib, chess, collections, random
C={x['id']:x for x in json.load(open('candidates.json'))}
A=[json.loads(l) for l in open('analysis.jsonl')]
PN={1:'piyon',2:'at',3:'fil',4:'kale',5:'vezir',6:'şah'}
PNA={1:'piyonu',2:'atı',3:'fili',4:'kaleyi',5:'veziri',6:'şahı'}
TR={'N':'A','B':'F','R':'K','Q':'V','K':'Ş'}
def tsan(b,m):
    s=b.san(m); return ''.join(TR.get(ch,ch) for ch in s)
def line_san(b,pv,n=6):
    bb=b.copy(); out=[]
    for k,u in enumerate(pv[:n]):
        m=chess.Move.from_uci(u)
        if m not in bb.legal_moves: break
        num=bb.fullmove_number
        pre=(f'{num}.' if bb.turn else (f'{num}...' if k==0 else ''))
        out.append(pre+tsan(bb,m)); bb.push(m)
    return ' '.join(out)
CHAPTERS=[
 ('merkez','Merkez ve alan','Merkezi tutmak, alan kazanmak, taşları merkeze getirmek','⊕'),
 ('piyon','Piyon yapısı','Piyon kırmaları, zayıf piyonlar, geçer piyon, kanat atakları','♟'),
 ('kare','Güçlü ve zayıf kareler','İleri karakol, zayıf kareleri işgal etmek ve hedef yaratmak','◼'),
 ('hafif','Fil ve at','İyi fil, kötü fil, fil çifti, at ile fil mücadelesi','♝'),
 ('kale','Açık hat ve kaleler','Açık hatlar, yedinci yatay, kalelerin aktifliği','♜'),
 ('gelisim','Gelişim ve inisiyatif','Gelişim üstünlüğü, inisiyatif, şah güvenliği','⚡'),
 ('kisitlama','Profilaksi ve kısıtlama','Rakibin planını önlemek, karşı oyunu durdurmak','🛡'),
 ('yerlesim','Taşların yerleşimi','En kötü taşı iyileştirmek, uyum ve koordinasyon','♞'),
 ('avantaj','Avantajı kullanma','Malzeme ve pozisyon üstünlüğünü kazanca çevirmek','🏆'),
 ('oyunsonu','Stratejik oyunsonu','Taşlar azaldığında doğru plan','♔'),
]
KW=[('oyunsonu',['endgame']),('avantaj',['material advantage','making the most','material']),
 ('kisitlama',['restriction','counterplay','total control','prophyla','defender']),
 ('kale',['open file','rank','rook']),('hafif',['bishop','diagonal','minor piece','knights']),
 ('kare',['square','target','weak points']),('piyon',['pawn','passed','flank']),
 ('merkez',['centre','center','space','territor','centraliz']),
 ('gelisim',['develop','initiative','dynamic','king','attack','queen raid','extravag','ignorance','macho','premature','same piece']),
 ('yerlesim',['where the pieces','harmony','out of play','coordination'])]
def chap_kw(s):
    s=s.lower()
    for k,ws in KW:
        if any(w in s for w in ws): return k
VAL={1:1,2:3,3:3,4:5,5:9,6:0}
def passed(b,sq,col):
    f=chess.square_file(sq); r=chess.square_rank(sq)
    for p in b.pieces(chess.PAWN,not col):
        pf,pr=chess.square_file(p),chess.square_rank(p)
        if abs(pf-f)<=1 and ((pr>r) if col else (pr<r)): return False
    return True
def outpost(b,sq,col):
    r=chess.square_rank(sq); f=chess.square_file(sq)
    if (r<4) if col else (r>3): return False
    if not any(b.piece_at(s) and b.piece_at(s).piece_type==1 and b.piece_at(s).color==col for s in b.attackers(col,sq)): return False
    for p in b.pieces(chess.PAWN,not col):
        pf,pr=chess.square_file(p),chess.square_rank(p)
        if abs(pf-f)==1 and ((pr>r) if col else (pr<r)): return False
    return True
def file_state(b,f,col):
    own=any(chess.square_file(p)==f for p in b.pieces(chess.PAWN,col)); opp=any(chess.square_file(p)==f for p in b.pieces(chess.PAWN,not col))
    return 'acik' if not own and not opp else ('yarı' if not own else '')
def mobility(b,sq):
    bb=b.copy(); return sum(1 for m in bb.legal_moves if m.from_square==sq)
def opp_mob(b):
    bb=b.copy(); bb.turn=not bb.turn
    try: return bb.legal_moves.count()
    except Exception: return 0
def bad_bishop(b,sq,col):
    light=(chess.square_file(sq)+chess.square_rank(sq))%2
    return sum(1 for p in b.pieces(chess.PAWN,col) if (chess.square_file(p)+chess.square_rank(p))%2==light)>=4
def stops(b,m,ti):
    tm=ti[2]; a=b.copy(); a.push(m)
    if a.is_check(): return False
    if tm not in a.legal_moves: return True
    before=b.attacks(m.from_square); after=a.attacks(m.to_square)
    return tm.to_square in after and tm.to_square not in before
def features(b,m,threat_info,cur_wp):
    col=b.turn; p=b.piece_at(m.from_square); pt=p.piece_type; to=m.to_square; F=[]
    cap=b.piece_at(to) if b.is_capture(m) else None
    a=b.copy(); a.push(m)
    if b.is_castling(m): F.append(('sah','Şahını güvenli kanada alır ve kaleyi oyuna bağlar.'))
    if threat_info and cur_wp-threat_info[0]>=12 and not cap and stops(b,m,threat_info):
        F.append(('profi',f'Rakibin {threat_info[1]} fikrini önceden engeller (profilaksi).'))
    if pt in (2,3) and outpost(a,to,col): F.append(('karakol',f'{PNA[pt].capitalize()} {chess.square_name(to)} karesine, rakip piyonların kovalayamayacağı ileri karakola yerleştirir.'))
    if pt in (4,5) and chess.square_file(to)!=chess.square_file(m.from_square):
        fs=file_state(a,chess.square_file(to),col)
        if fs=='acik': F.append(('hat',f'{PNA[pt].capitalize()} açık {"abcdefgh"[chess.square_file(to)]} hattına getirip hattın kontrolünü alır.'))
        elif fs=='yarı': F.append(('hat',f'{PNA[pt].capitalize()} yarı açık {"abcdefgh"[chess.square_file(to)]} hattına getirip rakip piyona baskı kurar.'))
    if pt==4 and chess.square_rank(to)==(6 if col else 1): F.append(('yedi','Kaleyi rakibin ikinci yatayına (7. yatay) sokar.'))
    if pt==1:
        if passed(a,to,col): F.append(('gecer','Geçer piyonu ilerletir; piyon ilerledikçe rakip taşları bağlanır.'))
        elif any(a.piece_at(s) and a.piece_at(s).piece_type==1 and a.piece_at(s).color!=col for s in a.attacks(to)) and not cap:
            F.append(('kirma','Piyon kırması yapar: rakibin piyon zincirine saldırıp hat açar.'))
        elif not cap: F.append(('alan','Piyonla alan kazanır ve rakip taşların karelerini daraltır.'))
    if cap and VAL[cap.piece_type]==VAL[pt] and pt in (2,3):
        if cap.piece_type==3 and not bad_bishop(b,to,not col): F.append(('degis','Rakibin iyi çalışan fili ile değişir.'))
        elif pt==3 and bad_bishop(b,m.from_square,col): F.append(('degis','Kendi kötü filini rakibin aktif taşıyla değişir.'))
        else: F.append(('degis','Rakibin en etkili savunucusu olan taşı değişir.'))
    if pt in (2,3,4,5) and not cap:
        mb=mobility(b,m.from_square); ma=a.copy(); ma.turn=col; ma_m=sum(1 for x in ma.legal_moves if x.from_square==to)
        if ma_m-mb>=3: F.append(('iyiles',f'{PNA[pt].capitalize()} pasif yerinden daha aktif bir kareye taşır.'))
    if to in (chess.D4,chess.E4,chess.D5,chess.E5) and pt in (2,3,5) and not cap: F.append(('merkez',f'{PNA[pt].capitalize()} merkeze yerleştirir.'))
    if pt==6 and not b.is_castling(m) and len(b.piece_map())<=14: F.append(('aktifsah','Şahı oyuna sokar; taşlar azaldığında şah güçlü bir taştır.'))
    return F
def topic_from(F,b):
    ks=[k for k,_ in F]
    nq=not b.pieces(chess.QUEEN,True) and not b.pieces(chess.QUEEN,False)
    if nq and len(b.piece_map())<=12: return 'oyunsonu'
    for k,t in [('profi','kisitlama'),('karakol','kare'),('hat','kale'),('yedi','kale'),('kirma','piyon'),('gecer','piyon'),('alan','piyon'),('degis','hafif'),('sah','gelisim'),('merkez','merkez'),('iyiles','yerlesim'),('aktifsah','oyunsonu')]:
        if t and k in ks: return t
    return 'yerlesim'
def mat_after(b,pv,n):
    bb=b.copy(); col=b.turn; m0=sum(VAL[p.piece_type]*(1 if p.color==col else -1) for p in bb.piece_map().values()); worst=0
    for k,u in enumerate(pv[:n]):
        mv=chess.Move.from_uci(u)
        if mv not in bb.legal_moves: break
        bb.push(mv)
        if k%2==1: worst=min(worst,sum(VAL[p.piece_type]*(1 if p.color==col else -1) for p in bb.piece_map().values())-m0)
    return worst
def drop_word(d):
    return 'Doğru plandan biraz zayıf kalır' if d<15 else ('Belirgin şekilde daha kötü bir plan' if d<25 else 'Ciddi bir hata')
BOOK_BASE={'yusupov1':0.0,'amateur':0.35,'wcs':0.35,'silman':0.45,'grooten':0.4,'yusupov3':0.5,'initiative':0.6,'hellsten':0.6,'iypp1':0.7,'iypp2':0.7,'bricard':0.75}
items=[]; why=collections.Counter()
for r in A:
    x=C[r['id']]
    if 'err' in r or not r.get('moves'): why['err']+=1; continue
    b=chess.Board(x['fen']); col=b.turn
    mv=sorted(r['moves'],key=lambda m:-m['wp'])
    best=mv[0]
    ans=next((m for m in mv if m['m']==x['move']),None)
    if best['mate'] is not None and best['mate']>0: why['mat']+=1; continue
    if r.get('swing',0)>=2: why['taktik']+=1; continue
    if best['cp'] is not None and best['cp']>650: why['bitmis']+=1; continue
    if best['wp']<12: why['kayip']+=1; continue
    if len(b.piece_map())>=31: why['acilis']+=1; continue
    if not ans or best['wp']-ans['wp']>5: why['kitap_hamlesi_zayif']+=1; continue
    am=chess.Move.from_uci(ans['m'])
    if mat_after(b,ans['pv'] or [ans['m']],2)<=-2: why['feda']+=1; continue
    a=b.copy(); a.push(am)
    # answer itself should not win material immediately (exchange ok)
    pool=[m for m in mv if m['m']!=ans['m']]+[m for m in r.get('low',[]) if m['m']!=ans['m']]
    seen=set(); P=[]
    for m in pool:
        if m['m'] in seen: continue
        seen.add(m['m']); d=ans['wp']-m['wp']; lim=10 if m.get('low') else 8
        if lim<=d<=45 and mat_after(b,[m['m']]+m['pv'][1:],4)>-2: P.append((d,m))
    if len(P)<2: why['celdirici_yok']+=1; continue
    P.sort(key=lambda t:t[0])
    # diversify by piece type
    ch=[]; used=collections.Counter()
    for d,m in P:
        pt=b.piece_at(chess.Move.from_uci(m['m']).from_square).piece_type
        if used[pt]>=1 and len(P)>4: continue
        ch.append((d,m)); used[pt]+=1
        if len(ch)==3: break
    if len(ch)<2: ch=P[:3]
    th=r.get('threat'); threat_info=None
    if th and th['pv']:
        nb=b.copy(); nb.push(chess.Move.null())
        try: threat_info=(th['wp'],tsan(nb,chess.Move.from_uci(th['pv'][0])),chess.Move.from_uci(th['pv'][0]))
        except Exception: pass
    F=features(b,am,threat_info,ans['wp'])
    ck=chap_kw(x['chap'] or '')
    topic=ck or topic_from(F,b)
    if x['book']=='bricard' and 'Endgame' in x['chap']: topic='oyunsonu'
    side='Beyaz' if col else 'Siyah'
    txt=' '.join(t for _,t in F[:2]) or 'Pozisyonun ihtiyacına uyan, taşları en uyumlu hale getiren devam.'
    cont=line_san(b,ans['pv'] if ans['pv'] else [ans['m']],5)
    choices=[{'m':ans['m'],'san':tsan(b,am),'ok':True,'why':txt+(f' Örnek devam: {cont}' if cont else '')}]
    for d,m in ch:
        mm=chess.Move.from_uci(m['m'])
        reply=''
        if len(m['pv'])>=2:
            bb=b.copy(); bb.push(mm)
            r1=chess.Move.from_uci(m['pv'][1])
            if r1 in bb.legal_moves: reply=tsan(bb,r1)
        Fm=features(b,mm,None,m['wp'])
        s=drop_word(d)+'.'
        if reply:
            bb=b.copy(); bb.push(mm); r1=chess.Move.from_uci(m['pv'][1])
            dots='...' if col else ''
            loss=mat_after(b,m['pv'],6)
            if loss<=-1: s+=f' Rakip {dots}{reply} ile başlayan devamla malzeme kazanır.'
            elif bb.is_capture(r1): s+=f' Rakip {dots}{reply} ile değişip rahatlar.'
            elif threat_info and threat_info[1]==reply: s+=f' Rakibin {reply} planına izin verir.'
            else: s+=f' Rakip {"..." if col else ""}{reply} ile rahat bir oyun bulur.'
        if 'profi' in [k for k,_ in F] and threat_info[1]!=reply: s+=f' Ayrıca rakibin {threat_info[1]} fikrini engellemez.'
        choices.append({'m':m['m'],'san':tsan(b,mm),'ok':False,'why':s,'d':round(d,1)})
    rnd=random.Random(r['id']); rnd.shuffle(choices)
    # difficulty
    also=sum(1 for m in mv if m['m']!=ans['m'] and ans['wp']-m['wp']<5)
    quiet=0 if b.is_capture(am) or a.is_check() else 1
    mind=min(d for d,_ in ch)
    raw=BOOK_BASE.get(x['book'],0.5)*2 + 0.8*quiet + 0.25*min(also,4) + (20-min(mind,20))/10 + (0.6 if not F else 0) + 0.3*(mv.index(ans)>0)
    items.append({'id':x['id'],'ch':topic,'fen':x['fen'],'choices':choices,'line':ans['pv'][:8] if ans['pv'] else [ans['m']],'src':x['book'],'raw':raw,'feat':[k for k,_ in F]})
# levels by percentile
rs=sorted(i['raw'] for i in items)
import bisect
cuts=[0.15,0.35,0.55,0.75,0.9]
for i in items:
    p=bisect.bisect_left(rs,i['raw'])/max(1,len(rs)-1)
    i['level']=1+sum(p>=c for c in cuts); i['diff']=round(p,4); del i['raw']
order={c[0]:k for k,c in enumerate(CHAPTERS)}
items.sort(key=lambda i:(order[i['ch']],i['level'],i['diff']))
cnt=collections.Counter()
for i in items:
    cnt[i['ch']]+=1; i['title']=f"{dict((c[0],c[1]) for c in CHAPTERS)[i['ch']]} {cnt[i['ch']]}"
out={'chapters':[{'id':a,'name':n,'desc':d,'icon':ic} for a,n,d,ic in CHAPTERS if cnt[a]],'items':items}
json.dump(out,open(sys.argv[1] if len(sys.argv)>1 else 'strategy.json','w'),ensure_ascii=False,separators=(',',':'))
print(len(A),'->',len(items),dict(why)); print(dict(cnt)); print(collections.Counter(i['level'] for i in items))
print(collections.Counter(i['src'] for i in items))
