import {beforeEach,describe,it,expect,vi} from 'vitest';
import {emptyCompany} from '../model';
const mocks=vi.hoisted(()=>({extract:vi.fn(),load:vi.fn(),save:vi.fn(),client:{current:true}}));
vi.mock('@/lib/llm',()=>({get llmClient(){return mocks.client.current?{extract:mocks.extract}:null;},EXTRACTION_SYSTEM_PROMPT:''}));
vi.mock('../assemble',()=>({assembleCanonicalCompany:mocks.load}));
vi.mock('../repository',()=>({saveCanonicalCompany:mocks.save}));
import {extractCompanyIntelligence} from '../extract';
beforeEach(()=>{
 vi.clearAllMocks();mocks.client.current=true;
 const c=emptyCompany('C','Test');c.sources=[{id:'S',entity_type:'company',entity_id:'C',type:'TXT',filename:'company.txt',origin:'CUSTOMER_UPLOAD',sha256:null,storage_path:null,status:'AVAILABLE',created_at:''}];
 c.chunks=[{id:'CH',source_id:'S',page:null,section:null,paragraph:1,cell_range:null,text:'Road construction',created_at:''}];
 mocks.load.mockResolvedValue(c);mocks.save.mockImplementation(async c=>({...c,revision:1}));
});
describe('Unified extraction pipeline errors and persistence',()=>{
 it('missing configuration is LLM_UNAVAILABLE, never successful empty knowledge',async()=>{mocks.client.current=false;await expect(extractCompanyIntelligence('C')).rejects.toMatchObject({code:'LLM_UNAVAILABLE'});expect(mocks.save).not.toHaveBeenCalled();});
 it('failed model request is LLM_REQUEST_FAILED and preserves existing profile',async()=>{mocks.extract.mockRejectedValue(new Error('network'));await expect(extractCompanyIntelligence('C')).rejects.toMatchObject({code:'LLM_REQUEST_FAILED'});expect(mocks.save).not.toHaveBeenCalled();});
 it('malformed output is LLM_PARSE_ERROR with no partial write',async()=>{mocks.extract.mockResolvedValue('{bad');await expect(extractCompanyIntelligence('C')).rejects.toMatchObject({code:'LLM_PARSE_ERROR'});expect(mocks.save).not.toHaveBeenCalled();});
 it('repeated extraction persists one canonical record with stable id',async()=>{
  mocks.extract.mockResolvedValue(JSON.stringify({capabilities:[{label:'Road construction',chunk_ids:['CH']}]}));
  await extractCompanyIntelligence('C');const first=mocks.save.mock.calls[0][0];mocks.load.mockResolvedValue(first);
  await extractCompanyIntelligence('C');const second=mocks.save.mock.calls[1][0];
  expect(second.capabilities).toHaveLength(1);expect(second.capabilities[0].id).toBe(first.capabilities[0].id);expect(second.capabilities[0].evidence).toEqual(['CH']);
 });
});
