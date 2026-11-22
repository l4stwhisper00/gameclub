import {assertEquals,assertThrows} from "jsr:@std/assert@1";
import {applyDixitAction,getDixitPrivateState,getDixitPublicState,startImaginarium} from "./engine.ts";

Deno.test("Imaginarium uses its own game id and private hands",()=>{
 const state=startImaginarium(["a","b","c"],"a",()=>0.3);
 assertEquals(state.gameId,"imaginarium");
 assertEquals(getDixitPrivateState(state,"a").hand.length,6);
 assertEquals("hands" in getDixitPublicState(state),false);
});
Deno.test("Imaginarium keeps cards secret until voting and scores a round",()=>{
 let state=startImaginarium(["a","b","c"],"a",()=>0.3);
 const card=getDixitPrivateState(state,"a").hand[0];
 state=applyDixitAction(state,"a",{type:"story",cardId:card.id,clue:"Мечта"});
 for(const id of ["b","c"]){const choice=getDixitPrivateState(state,id).hand[0];state=applyDixitAction(state,id,{type:"submit",cardId:choice.id});}
 assertEquals(state.phase,"vote");
 const correct=state.submissions.find((item)=>item.cardId===card.id)!;
 state=applyDixitAction(state,"b",{type:"vote",submissionId:correct.id});
 state=applyDixitAction(state,"c",{type:"vote",submissionId:correct.id});
 assertEquals(state.phase,"results");
 assertEquals(state.gameId,"imaginarium");
});
Deno.test("only storyteller can advance the Imaginarium round",()=>{
 let state=startImaginarium(["a","b","c"],"a",()=>0.3);
 const card=getDixitPrivateState(state,"a").hand[0];
 state=applyDixitAction(state,"a",{type:"story",cardId:card.id,clue:"Образ"});
 for(const id of ["b","c"]){const choice=getDixitPrivateState(state,id).hand[0];state=applyDixitAction(state,id,{type:"submit",cardId:choice.id});}
 const correct=state.submissions.find((item)=>item.cardId===card.id)!;
 state=applyDixitAction(state,"b",{type:"vote",submissionId:correct.id});
 state=applyDixitAction(state,"c",{type:"vote",submissionId:correct.id});
 assertThrows(()=>applyDixitAction(state,"b",{type:"next_round"}));
 state=applyDixitAction(state,"a",{type:"next_round"});
 assertEquals(state.round,2);
});
