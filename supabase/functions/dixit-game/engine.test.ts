import {assertEquals,assertThrows} from "jsr:@std/assert@1";
import {applyDixitAction,getDixitPrivateState,getDixitPublicState,startDixit} from "./engine.ts";

Deno.test("hands are private and the public projection hides deck and roles",()=>{
 const state=startDixit(["a","b","c"],"a",()=>0.3);
 assertEquals(getDixitPrivateState(state,"a").hand.length,6);
 assertEquals("hands" in getDixitPublicState(state),false);
 assertEquals(getDixitPrivateState(state,"b").isStoryteller,false);
});
Deno.test("storyteller selects a card and clue; others submit",()=>{
 let state=startDixit(["a","b","c"],"a",()=>0.3);
 const storyteller=state.players[0],card=getDixitPrivateState(state,storyteller).hand[0];
 state=applyDixitAction(state,storyteller,{type:"story",cardId:card.id,clue:"Тихая мечта"});
 assertEquals(state.phase,"choose");
 for(const id of ["b","c"]){const choice=getDixitPrivateState(state,id).hand[0];state=applyDixitAction(state,id,{type:"submit",cardId:choice.id});}
 assertEquals(state.phase,"vote");
});
Deno.test("players cannot vote for their own submission",()=>{
 let state=startDixit(["a","b","c"],"a",()=>0.3);
 const card=getDixitPrivateState(state,"a").hand[0];
 state=applyDixitAction(state,"a",{type:"story",cardId:card.id,clue:"Секрет"});
 for(const id of ["b","c"]){const choice=getDixitPrivateState(state,id).hand[0];state=applyDixitAction(state,id,{type:"submit",cardId:choice.id});}
 const own=state.submissions.find((item)=>item.ownerId==="b")!;
 assertThrows(()=>applyDixitAction(state,"b",{type:"vote",submissionId:own.id}));
});
Deno.test("voting scores a round and reveals card owners only afterward",()=>{
 let state=startDixit(["a","b","c"],"a",()=>0.3);
 const storyteller="a",card=getDixitPrivateState(state,storyteller).hand[0];
 state=applyDixitAction(state,storyteller,{type:"story",cardId:card.id,clue:"Образ"});
 for(const id of ["b","c"]){const choice=getDixitPrivateState(state,id).hand[0];state=applyDixitAction(state,id,{type:"submit",cardId:choice.id});}
 const correct=state.submissions.find((item)=>item.cardId===card.id)!;
 for(const id of ["b","c"])state=applyDixitAction(state,id,{type:"vote",submissionId:correct.id});
 assertEquals(state.phase,"results");
 assertEquals(typeof getDixitPublicState(state).submissions[0].ownerId,"string");
});
