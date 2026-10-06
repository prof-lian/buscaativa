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
  
  function isSim(v){ 
    var t=norm(v).toLowerCase(); 
    if(!t || t==='-' || t==='não' || t==='nao' || t==='falso') return false; 
    return true; 
  }
  
  function isSimStrict(v) {
    var t = String(v||'').trim().toLowerCase();
    return t.indexOf('sim') === 0;
  }
  
  function cap(s){ return norm(s).split(' ').map(function(w){return w.length>2? (w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()):w.toLowerCase();}).join(' '); }

  function datesIn(v){
    var t=norm(v), out=[], m;
    var re=/(\d{1,2})\/(\d{1,2})/g;
    while((m=re.exec(t))){ var d=+m[1], mm=+m[2]; if(d>=1&&d<=31&&mm>=1&&mm<=12) out.push([mm,d]); }
    var iso=/^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if(iso) out.push([+iso[2],+iso[3]]);
    return out;
  }

  function parseStudents(payload){
    var recs=[];
    (payload.sheets||[]).forEach(function(sh){
      var sheet=sh.name, V=sh.values||[], notes=sh.notes||[];
      var headerRows=[];
      for(var r=0;r<V.length;r++){
        for(var c=0;c<(V[r]||[]).length;c++){
          if(low(V[r][c])==='nome'){ headerRows.push(r); break; }
        }
      }
      headerRows.push(V.length);
      for(var b=0;b<headerRows.length-1;b++){
        var hr=headerRows[b], end=headerRows[b+1]-1; 
        var turma=null;
        for(var rr=hr-1; rr>=Math.max(0,hr-2); rr--){ if(norm(V[rr] && V[rr][0])){ turma=norm(V[rr][0]); break; } }
        if(!turma) continue;
        
        var band={}, cur=null, titleRow=V[hr-1]||[];
        for(var c2=0;c2<titleRow.length
