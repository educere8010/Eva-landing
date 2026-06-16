(function(root){
  'use strict';
  const pdfjsLib=root.pdfjsLib;
  if(!pdfjsLib)throw new Error('pdf.js is required');
  pdfjsLib.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.js',document.baseURI).href;

  async function extract(file,{onProgress}={}){
    if(!file)throw new Error('PDF 파일을 선택해 주세요.');
    if(file.type&&file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw new Error('PDF 파일만 분석할 수 있습니다.');
    const data=new Uint8Array(await file.arrayBuffer());
    const task=pdfjsLib.getDocument({data});
    const pdf=await task.promise;
    const pages=[];
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
      const page=await pdf.getPage(pageNumber);
      const content=await page.getTextContent();
      let text='';
      content.items.forEach(item=>{
        text+=item.str||'';
        text+=item.hasEOL?'\n':' ';
      });
      pages.push(text.replace(/[ \t]+\n/g,'\n').trim());
      if(onProgress)onProgress({page:pageNumber,total:pdf.numPages});
    }
    const characterCount=pages.reduce((sum,page)=>sum+page.replace(/\s/g,'').length,0);
    return {
      fileName:file.name,
      pageCount:pdf.numPages,
      characterCount,
      pages,
      text:pages.map((page,index)=>`[${index+1}페이지]\n${page}`).join('\n\n'),
      scanned:characterCount<Math.max(250,pdf.numPages*35)
    };
  }

  root.EVAPdfExtractor={extract,version:pdfjsLib.version};
})(globalThis);
