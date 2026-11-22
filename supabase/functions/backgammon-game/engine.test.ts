import {assertEquals,assertThrows} from "jsr:@std/assert@1";
import {applyBackgammonAction,getBackgammonPublicState,getLegalBackgammonMoves,startBackgammon} from "./engine.ts";

Deno.test("initial board has fifteen checkers per player",()=>{
 const state=startBackgammon(["w","b"]);
 assertEquals(state.board.reduce((sum,p)=>sum+(p.owner==="white"?p.count:0),0),15);
 assertEquals(state.board.reduce((sum,p)=>sum+(p.owner==="black"?p.count:0),0),15);
 assertEquals(getBackgammonPublicState(state).legalMoves.length,0);
});
Deno.test("only current player can roll and doubles give four moves",()=>{
 let state=startBackgammon(["w","b"]);
 assertThrows(()=>applyBackgammonAction(state,"b",{type:"roll"},()=>0));
 state=applyBackgammonAction(state,"w",{type:"roll"},()=>0);
 assertEquals(state.dice.length,4);
 assertEquals(state.dice.every((die)=>die===1),true);
});
Deno.test("bar entry is mandatory before moving other checkers",()=>{
 let state=startBackgammon(["w","b"]);
 state.bar.white=1;
 state=applyBackgammonAction(state,"w",{type:"roll"},()=>0);
 const moves=getLegalBackgammonMoves(state);
 assertEquals(moves.every((move)=>move.from==="bar"),true);
});
Deno.test("blocked points cannot be entered",()=>{
 let state=startBackgammon(["w","b"]);
 state.board[22]={owner:"black",count:2};
 state.phase="move";state.dice=[1];
 assertEquals(getLegalBackgammonMoves(state).some((move)=>move.to==="22"),false);
});
Deno.test("hitting a blot sends the opponent checker to the bar",()=>{
 let state=startBackgammon(["w","b"]);
 state.board[22]={owner:"black",count:1};
 state.phase="move";state.dice=[1];
 state=applyBackgammonAction(state,"w",{type:"move",from:"23",to:"22",die:1});
 assertEquals(state.bar.black,1);
 assertEquals(state.board[22].owner,"white");
});

Deno.test("legal moves preserve the ability to use both dice when possible",()=>{
 const state=startBackgammon(["w","b"]);state.phase="move";state.dice=[1,2];
 const moves=getLegalBackgammonMoves(state);
 assertEquals(moves.length>0,true);
 for(const move of moves){const next=applyBackgammonAction(state,"w",{type:"move",...move});assertEquals(next.phase,"move");}
});
