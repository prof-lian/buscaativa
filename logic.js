/* logic.js — parsing + correção + métricas do Busca Ativa.
   Puro, sem DOM. Usado no navegador (site) e no Node (teste).
   Recebe o payload do Apps Script: { sheets:[{name, values[][], notes[][]}], comments:[...] }
*/
(function (root) {
  'use strict';

  var ANO_ORDER = ['PRIMEIROS','SEGUNDOS','TERCEIROS','QUARTOS','QUINTOS','QUINTOS TARDE','SEXTOS','SÉTIMOS','OITAVOS','NONOS'];
  var LBL = {PRIMEIROS:'1º ano',SEGUNDOS:'2º ano',TERCEIROS:'3º ano',QUARTOS:'4º ano',QUINTOS:'5º ano','QUINTOS TARDE':'5º ano',
             SEXTOS:'6º ano',SÉTIMOS:'7º ano',OITAVOS:'8º ano',NONOS:'9º ano'};
  var SEG = {PRIMEIROS:'Anos Iniciais',SEGUNDOS:'Anos Iniciais',TERCEIROS:'Anos Iniciais',QUARTOS:'Anos Iniciais',
             QUINTOS:'Anos Iniciais','QUINTOS TARDE':'Anos Iniciais',SEXTOS:'Anos Finais',SÉTIMOS:'Anos Finais',OITAVOS:'Anos Finais',NONOS:'Anos Finais'};

  function norm(s){ return String(s==null?'':s).replace(/\s+/g,' ').trim(); }
  function up(s){ return norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(); }
  function low(s){ return norm(s).toLowerCase(); }
  function num(v){
    if (v===''||v==null) return null;
    if (typeof v==='number') return v;
    var s=String(v).replace(',','.').replace(/[^0-9.\-]/g,'');
    if (s===''||s==='-'||s==='.') return null;
    var f=parseFloat(s); return isNaN(f)?null:f;
  }
  function isSim(v){ var t=low(v); return t.indexOf('sim')===0 || t.indexOf('realizad')===0; }
  function isNao(v){ var t=low(v); return t.indexOf('não')===0 || t.indexOf('nao')===0; }
  function cap(s){ return norm(s).split(' ').map(function(w){return w.length>2? (w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()):w.toLowerCase();}).join(' '); }

  function datesIn(v){
    var t=norm(v), out=[], m;
    var re=/(\d{1,2})\/(\d{1,2})/g;
    while((m=re.exec(t))){ var d=+m[1], mm=+m[2]; if(d>=1&&d<=31&&mm>=1&&mm<=12) out.push([mm,d]); }
    var iso=/^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if(iso) out.push([+iso[2],+iso[3]]);
    return out;
  }

  // ---- parseia um payload em lista de registros de aluno + colunas de anotação por célula
  function parseStudents(payload){
    var recs=[];
    (payload.sheets||[]).forEach(function(sh){
      var sheet=sh.name, V=sh.values||[], notes=sh.notes||[];
      // acha linhas de cabeçalho (célula == 'Nome')
      var headerRows=[];
      for(var r=0;r<V.length;r++){
        for(var c=0;c<(V[r]||[]).length;c++){
          if(low(V[r][c])==='nome'){ headerRows.push(r); break; }
        }
      }
      headerRows.push(V.length);
      for(var b=0;b<headerRows.length-1;b++){
        var hr=headerRows[b], end=headerRows[b+1]-1; // end = linha do título do próximo bloco
        // turma: procura em coluna 0 subindo de hr-1
        var turma=null;
        for(var rr=hr-1; rr>=Math.max(0,hr-2); rr--){ if(norm(V[rr] && V[rr][0])){ turma=norm(V[rr][0]); break; } }
        if(!turma) continue;
        // bandas (bimestre) na linha hr-1
        var band={}, cur=null, titleRow=V[hr-1]||[];
        for(var c2=0;c2<titleRow.length;c2++){
          var tv=up(titleRow[c2]);
          if(tv.indexOf('BIMESTRE')>=0) cur=tv.charAt(0)+'B';
          else if(tv.indexOf('TOTAL')>=0) cur='TOT';
          band[c2]=cur;
        }
        // classifica colunas pelo header
        var head=V[hr]||[], cols={}, meta={};
        function set(bd,role,c){ (cols[bd]=cols[bd]||{})[role]=c; }
        // contadores de ocorrência p/ inferir o bimestre quando a banda não diz
        var seq={BUS:0,SAE:0,RET:0,DEV:0,BIL:0,FBIM:0,INJ:0,ATE:0};
        var ordBim=['1B','2B','3B','4B'];
        function bimDe(bd,role){ if(bd && /^[1-4]B$/.test(bd)) return bd; var i=seq[role]||0; return ordBim[i]||'4B'; }
        for(var c3=0;c3<head.length;c3++){
          var h=low(head[c3]); if(!h) continue; var bd=band[c3]||'';
          if(h==='nome') meta.NOME=c3;
          else if(h==='código'||h==='codigo') meta.COD=c3;
          else if(h.indexOf('situa')===0) meta.SITUACAO=c3;
          else if(h.indexOf('reclassifica')===0) meta.RECLASS=c3;
          else if(h.indexOf('assinatura')===0) meta.ASSIN=c3;
          else if(h.indexOf('data matr')===0) meta.MATRIC=c3;
          else if(h.indexOf('busca ativa')===0){ set(bimDe(bd,'BUS'),'BUS',c3); seq.BUS++; }
          else if(h.indexOf('devolutiv')===0){ set(bimDe(bd,'DEV'),'DEV',c3); seq.DEV++; }
          else if(h.indexOf('encaminhado')===0){ set(bimDe(bd,'SAE'),'SAE',c3); seq.SAE++; }
          else if(h.indexOf('retorno')===0){ set(bimDe(bd,'RET'),'RET',c3); seq.RET++; }
          else if(h.indexOf('bilhete')===0){ set(bimDe(bd,'BIL'),'BIL',c3); seq.BIL++; }
          else if(h.indexOf('qt. faltas injust')===0 || h.indexOf('faltas injust')===0){ set(bimDe(bd,'INJ'),'INJ',c3); seq.INJ++; }
          else if(/^(qt\.?\s*)?(de\s+)?atestado/.test(h)){ set(bimDe(bd,'ATE'),'ATE',c3); seq.ATE++; }
          else if(/^(qt\.?\s*)?faltas?\s*(no\s*)?\d\s*[°º]?\s*bim/.test(h)){ set(bimDe(bd,'FBIM'),'FBIM',c3); seq.FBIM++; }
          else if(/^(qt\.?\s*)?(de\s+)?faltas/.test(h)){ set(bd||'','FCOL',c3); }
        }
        if(meta.NOME==null) continue;
        // coluna logo após o Nome costuma ser Situação/Reclassificação (onde vai "TRANSFERIDO"),
        // mesmo quando o cabeçalho está em branco. Captura como SITU2 se não for já conhecida.
        var apos=meta.NOME+1;
        var conhecidas={}; conhecidas[meta.COD]=1; conhecidas[meta.RECLASS]=1; conhecidas[meta.ASSIN]=1; conhecidas[meta.MATRIC]=1; conhecidas[meta.SITUACAO]=1;
        if(!conhecidas[apos]) meta.SITU2=apos;
        if(meta.RECLASS==null && !conhecidas[apos]) { /* já vira SITU2 */ }
        for(var r2=hr+1;r2<=end;r2++){
          var row=V[r2]; if(!row) continue;
          var nome=norm(row[meta.NOME]); if(!nome) continue;
          var rec={sheet:sheet, ano:LBL[sheet], seg:SEG[sheet], turma:turma, linha:r2+1, nome:nome, nomeChave:up(nome),
                   cells:{}, notas:[]};
          ['COD','RECLASS','ASSIN','MATRIC','SITUACAO','SITU2'].forEach(function(k){ if(meta[k]!=null) rec[k]=norm(row[meta[k]]); });
          ['1B','2B','3B','4B'].forEach(function(bi){
            var cc=cols[bi]||{};
            var fbim = cc.FBIM!=null? num(row[cc.FBIM]) : null;
            var fcol = cc.FCOL!=null? num(row[cc.FCOL]) : null;
            var ate  = cc.ATE!=null?  num(row[cc.ATE])  : null;
            var inj  = cc.INJ!=null?  num(row[cc.INJ])  : null;
            var duplo = (cc.FBIM!=null && cc.FCOL!=null);
            var faltas = fbim!=null? fbim : fcol;   // se há coluna do próprio bimestre, usa ela; senão a única
            var injust;
            if(duplo) injust = faltas!=null? (faltas-(ate||0)) : null;
            else injust = inj!=null? inj : (faltas!=null? faltas-(ate||0) : null);
            rec[bi+'_f']=faltas; rec[bi+'_a']=ate;
            rec[bi+'_i']= injust!=null? Math.max(injust,0):null;
            rec[bi+'_acum']= duplo? fcol : null;
            rec[bi+'_BUS']= cc.BUS!=null? norm(row[cc.BUS]):'';
            rec[bi+'_SAE']= cc.SAE!=null? norm(row[cc.SAE]):'';
            rec[bi+'_RET']= cc.RET!=null? norm(row[cc.RET]):'';
            rec[bi+'_DEV']= cc.DEV!=null? norm(row[cc.DEV]):'';
            rec[bi+'_BIL']= cc.BIL!=null? norm(row[cc.BIL]):'';
          });
          // notas de célula desta linha -> anexa com o header da coluna
          if(notes && notes[r2]){
            for(var cn=0;cn<notes[r2].length;cn++){
              var nt=norm(notes[r2][cn]);
              if(nt){ rec.notas.push({coluna:norm(head[cn])||('col'+cn), texto:nt}); }
            }
          }
          // flags derivadas
          rec.busca1=isSim(rec['1B_BUS']); rec.busca2=isSim(rec['2B_BUS']);
          rec.busca3=isSim(rec['3B_BUS']); rec.busca4=isSim(rec['4B_BUS']);
          rec.buscaAny=rec.busca1||rec.busca2||rec.busca3||rec.busca4;
          rec.saeAny=[1,2,3,4].some(function(i){return isSim(rec[i+'B_SAE']);});
          rec.retAny=[1,2,3,4].some(function(i){var t=low(rec[i+'B_RET']);return isSim(rec[i+'B_RET'])||t.indexOf('mail')>=0;});
          var reclass=low(rec.RECLASS||''), ass=low(rec.ASSIN||'');
          rec.bilhete1=isSim(rec['1B_BIL'])||/bilhete/.test(low(rec['1B_BIL']));
          rec.bilhete2=isSim(rec['2B_BIL'])||/bilhete/.test(low(rec['2B_BIL']));
          rec.bilhete3=isSim(rec['3B_BIL'])||/bilhete/.test(low(rec['3B_BIL']));
          rec.bilhete4=isSim(rec['4B_BIL'])||/bilhete/.test(low(rec['4B_BIL']));
          rec.bilhete=rec.bilhete1||rec.bilhete2||rec.bilhete3||rec.bilhete4||/bilhete/.test(reclass);
          rec.transf=/transferid|domiciliar/.test(reclass) || /transferid|domiciliar/.test(low(rec.SITUACAO||'')) || /transferid|domiciliar/.test(low(rec.SITU2||''));
          rec.laudo=/laudo/.test(reclass);
          rec.termo=/assinad/.test(ass)||ass.indexOf('sim')===0||/assinad/.test(reclass);
          // devolutivas (texto do relato) por bimestre
          rec.devolutivas=[];
          [1,2,3,4].forEach(function(i){ var d=rec[i+'B_DEV']; if(d && d.length>3) rec.devolutivas.push({bim:i, texto:d}); });
          rec.alcancado=rec.buscaAny||rec.bilhete||rec.saeAny;
          rec.contatos=[rec.busca1,rec.busca2,rec.busca3,rec.busca4,rec.bilhete,
                        isSim(rec['1B_SAE']),isSim(rec['2B_SAE']),isSim(rec['3B_SAE']),isSim(rec['4B_SAE'])]
                        .filter(Boolean).length;
          recs.push(rec);
        }
      }
    });
    return recs;
  }

  // ---- vincula comentários (threaded) aos alunos por nome (quotedFileContent)
  function linkComments(recs, comments){
    var idx={};
    recs.forEach(function(r){ (idx[r.nomeChave]=idx[r.nomeChave]||[]).push(r); });
    var vinc=[], naoVinc=[];
    (comments||[]).forEach(function(c){
      var quoted = c.quotedFileContent!=null? c.quotedFileContent : (c.celulaOrigem!=null? c.celulaOrigem : (c.context||''));
      var chave = quoted? up(quoted): null;
      var cand = chave? (idx[chave]||[]) : [];
      var item={autor:c.autor||(c.author&&c.author.displayName)||'—',
                data:c.data||c.createdTime||c.createdDate||'',
                texto:norm(c.texto!=null?c.texto:c.content),
                resolvido: c.resolvido!=null?!!c.resolvido:(c.resolved!=null?!!c.resolved:(low(c.status)==='resolved')),
                celula: quoted?norm(quoted):'', fonte:'comentário'};
      if(cand.length===1){ item.turma=cand[0].turma; item.aluno=cand[0].nome; item.linha=cand[0].linha; vinc.push(item); }
      else { item.ambiguo=cand.length>1; naoVinc.push(item); }
    });
    return {vinculados:vinc, naoVinculados:naoVinc};
  }

  // ---- notas de célula viram comentários vinculados (âncora perfeita)
  function notesAsComments(recs){
    var out=[];
    recs.forEach(function(r){
      (r.notas||[]).forEach(function(nt){
        out.push({aluno:r.nome, turma:r.turma, linha:r.linha, texto:nt.texto,
                  celula:nt.coluna, autor:'nota', data:'', resolvido:false, fonte:'nota'});
      });
    });
    return out;
  }

  // ---- categoriza o motivo declarado a partir do texto
  // Ordem importa: pistas específicas vêm antes da "questão familiar" genérica,
  // senão "mãe"/"pai" capturam relatos que na verdade são de saúde, emoção etc.
  var MOTIVOS=[
    ['Sem retorno / não localizado', /n[ãa]o atende|n[ãa]o localiz|n[úu]mero (errad|n[ãa]o)|sem retorno|n[ãa]o respond|caixa postal|desligad|correspond[êe]ncia volt|endere[çc]o n[ãa]o/i],
    ['Saúde mental / emocional', /ansiedad|depress|emocional|bullying|psic[óo]log|psiquiatr|medo|n[ãa]o quer (vir|ir)|desmotivad|recus|acompanhamento psic/i],
    ['Saúde / doença', /doen[çc]|gripe|febre|virose|hospital|m[eé]dic|internad|cirurgia|dor de|catapora|covid|dengue|consulta|atestad|convuls|crise/i],
    ['Transporte / distância', /transporte|[ôo]nibus|condu[çc][ãa]o|dist[âa]ncia|\blonge\b|carona|van escolar|passagem/i],
    ['Mudança de endereço', /mudan[çc]|mudou|outro bairro|foi embora|trocou de bairro|foi morar/i],
    ['Trabalho do aluno', /trabalh(a|ando) (na|no|com)|emprego|catando|feira|ajudar (o pai|a m[ãa]e|em casa|na ro[çc]a)/i],
    ['Sono / rotina', /dorm|acord|\bsono\b|hor[áa]rio|acorda atras|perde o [ôo]nibus|rotina/i],
    ['Questão familiar', /fam[ií]li|m[ãa]e|\bpai\b|av[óo]|respons[áa]vel|irm[ãa]o|separa[çc]|guarda|conselho tutelar/i],
    ['Contato realizado', /contato realizad|conversad|orientad|compareceu|reuni[ãa]o|ciente|assinou|compromisso/i]
  ];
  function classifyMotivo(texto){
    for(var i=0;i<MOTIVOS.length;i++){ if(MOTIVOS[i][1].test(texto)) return MOTIVOS[i][0]; }
    return 'Outro / não classificado';
  }

  function sum(arr,f){ var s=0; arr.forEach(function(x){var v=f(x); if(v!=null&&!isNaN(v))s+=v;}); return s; }
  function round(x,d){ var p=Math.pow(10,d||0); return Math.round(x*p)/p; }
  function pct(a,b){ return b? round(100*a/b,1):0; }

  function analyze(payload){
    var recs=parseStudents(payload);
    var comments=(payload.comments||[]);
    var lk=linkComments(recs, comments);
    var notas=notesAsComments(recs);
    // anexa contagem de anotações ao aluno
    var porAluno={};
    lk.vinculados.concat(notas).forEach(function(c){
      var k=c.turma+'|'+(c.aluno||''); (porAluno[k]=porAluno[k]||[]).push(c);
    });
    recs.forEach(function(r){
      r.comentarios=(porAluno[r.turma+'|'+r.nome]||[]);
      r.qtdComentarios=r.comentarios.length;
    });

    var N=recs.length;
    var pares=recs.filter(function(o){return o['1B_i']!=null && o['2B_i']!=null;});
    var turmasSet={}; recs.forEach(function(r){turmasSet[r.sheet+'|'+r.turma]=1;});

    function cnt(f){ return recs.filter(f).length; }
    var A={
      geradoEm: payload.geradoEm||'',
      n:N, turmas:Object.keys(turmasSet).length,
      i1:sum(recs,function(o){return o['1B_i'];}), i2:sum(recs,function(o){return o['2B_i'];}),
      f1:sum(recs,function(o){return o['1B_f'];}), f2:sum(recs,function(o){return o['2B_f'];}),
      a1:sum(recs,function(o){return o['1B_a'];}), a2:sum(recs,function(o){return o['2B_a'];}),
      buscasAcoes: cnt(function(o){return o.busca1;})+cnt(function(o){return o.busca2;})+cnt(function(o){return o.busca3;})+cnt(function(o){return o.busca4;}),
      alunosBusca: cnt(function(o){return o.buscaAny;}),
      bilhetes: cnt(function(o){return o.bilhete;}),
      alunosSae: cnt(function(o){return o.saeAny;}),
      alunosRet: cnt(function(o){return o.retAny;}),
      termos: cnt(function(o){return o.termo;}),
      transf: cnt(function(o){return o.transf;}),
      laudos: cnt(function(o){return o.laudo;}),
      alcancados: cnt(function(o){return o.alcancado;}),
      npares: pares.length,
      melhorou: pares.filter(function(o){return o['2B_i']<o['1B_i'];}).length,
      piorou: pares.filter(function(o){return o['2B_i']>o['1B_i'];}).length,
      zerou: pares.filter(function(o){return o['1B_i']>0 && o['2B_i']===0;}).length
    };
    A.varInj = pct(A.i2-A.i1, A.i1) * (A.i2<A.i1?1:1); A.varInj = A.i1? round(100*(A.i2-A.i1)/A.i1,1):0;
    A.pMel = pct(A.melhorou, A.npares);
    A.acoesTotais = A.buscasAcoes + A.bilhetes + A.alunosSae + A.alunosRet;
    A.diasRecuperados = sum(pares,function(o){return Math.max(o['1B_i']-o['2B_i'],0);});

    // por ano
    A.anos = ANO_ORDER.map(function(s){
      var g=recs.filter(function(o){return o.sheet===s;});
      var gp=pares.filter(function(o){return o.sheet===s;});
      var i1=sum(g,function(o){return o['1B_i'];}), i2=sum(g,function(o){return o['2B_i'];});
      var tset={}; g.forEach(function(o){tset[o.turma]=1;});
      return {ano:LBL[s], seg:SEG[s], n:g.length, turmas:Object.keys(tset).length,
        i1:i1, i2:i2, varInj: i1?round(100*(i2-i1)/i1,1):0,
        buscas:g.filter(function(o){return o.buscaAny;}).length,
        bilhetes:g.filter(function(o){return o.bilhete;}).length,
        sae:g.filter(function(o){return o.saeAny;}).length,
        mel: gp.filter(function(o){return o['2B_i']<o['1B_i'];}).length, np:gp.length};
    });

    // por turma
    var chaves={}; recs.forEach(function(o){chaves[o.sheet+'||'+o.turma]=1;});
    A.turmas_tab=Object.keys(chaves).map(function(k){
      var p=k.split('||'), s=p[0], t=p[1];
      var g=recs.filter(function(o){return o.sheet===s && o.turma===t;});
      var gp=pares.filter(function(o){return o.sheet===s && o.turma===t;});
      var i1=sum(g,function(o){return o['1B_i'];}), i2=sum(g,function(o){return o['2B_i'];});
      return {turma:norm(t).replace(/\s+/g,''), ano:LBL[s], ord:ANO_ORDER.indexOf(s), n:g.length,
        i1:i1,i2:i2, varInj:i1?round(100*(i2-i1)/i1,1):0,
        buscas:g.filter(function(o){return o.buscaAny;}).length,
        bilhetes:g.filter(function(o){return o.bilhete;}).length,
        sae:g.filter(function(o){return o.saeAny;}).length,
        mel:gp.filter(function(o){return o['2B_i']<o['1B_i'];}).length, np:gp.length};
    }).sort(function(a,b){ return a.ord-b.ord || a.turma.localeCompare(b.turma); });

    // comentários (notas + threaded), com motivo
    var todos = notas.concat(lk.vinculados).map(function(c){
      c.motivo=classifyMotivo(c.texto); return c;
    });
    var naoV = lk.naoVinculados.map(function(c){ c.motivo=classifyMotivo(c.texto); return c; });
    A.comentarios = todos;
    A.comentariosNaoVinc = naoV;
    A.totalComentarios = todos.length + naoV.length;
    // ranking de motivos (inclui não vinculados, pois o texto vale)
    var mc={};
    todos.concat(naoV).forEach(function(c){ mc[c.motivo]=(mc[c.motivo]||0)+1; });
    A.motivos = Object.keys(mc).map(function(k){return {motivo:k,n:mc[k]};})
                  .sort(function(a,b){return b.n-a.n;});

    // lista de alunos enxuta pro dashboard
    A.alunos = recs.map(function(o){
      return {nome:cap(o.nome), turma:norm(o.turma).replace(/\s+/g,''), ano:o.ano,
        i1:o['1B_i'], i2:o['2B_i'], f1:o['1B_f'], f2:o['2B_f'],
        busca:o.buscaAny, bilhete:o.bilhete, sae:o.saeAny, termo:o.termo, ret:o.retAny,
        transf:o.transf, laudo:o.laudo, contatos:o.contatos, qtdComentarios:o.qtdComentarios,
        comentarios:o.comentarios.map(function(c){return {texto:c.texto, motivo:classifyMotivo(c.texto),
          fonte:c.fonte, celula:c.celula, autor:c.autor, data:c.data, resolvido:c.resolvido};})};
    });

    return A;
  }

  var api={parseStudents:parseStudents, analyze:analyze, classifyMotivo:classifyMotivo,
           _util:{num:num,norm:norm,up:up,isSim:isSim,cap:cap,datesIn:datesIn}, MOTIVOS:MOTIVOS};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  root.BuscaAtiva=api;
})(typeof window!=='undefined'?window:globalThis);
