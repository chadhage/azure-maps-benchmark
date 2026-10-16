/**
 * @typedef {'geocode'|'autocomplete'} Strategy
 * @typedef {{addressLine?:string, locality?:string, adminDistrict?:string, postalCode?:string, countryRegion?:string}} Address
 * @typedef {{source:string, noMatch?:boolean, address?:Address, position?:[number,number], toleranceMeters?:number}} Expected
 * @typedef {{id:string, query:string, category:string, countryRegion?:string, coordinates?:[number,number], expected?:Expected}} AddressCase
 * @typedef {{strategies:Strategy[], top:number, concurrency:number}} RunOptions
 * @typedef {{rank:number, address:Address, formattedAddress:string, position:[number,number]|null, confidence:string|null, matchCodes:string[], entityType:string|null, calculationMethod:string|null}} Candidate
 * @typedef {{rank:number, correct:boolean, fields:Record<string,boolean>, distanceMeters:number|null}} Comparison
 * @typedef {{labelled:boolean, top1Correct:boolean|null, topKCorrect:boolean|null, firstCorrectRank:number|null, comparisons:Comparison[]}} Evaluation
 * @typedef {{decision:'accepted'|'rejected'|'unresolved', reviewer:string, note:string, reviewedAt:string}} Review
 * @typedef {{case:AddressCase, strategy:Strategy, status:'ok'|'error', candidates:Candidate[], evaluation:Evaluation, durationMs:number, attempts:number, retryDelayMs:number, error?:{code:string,message:string}, review?:Review, reviewHistory?:Review[]}} Result
 * @typedef {{low:number,high:number}} Interval
 * @typedef {{total:number,labelled:number,unlabelled:number,matched:number,errors:number,coverage:number|null,errorRate:number|null,top1Correct:number,topKCorrect:number,top1Accuracy:number|null,topKAccuracy:number|null,top1Interval95:Interval|null,topKInterval95:Interval|null,manualReviewed:number,manualAccepted:number,manualUnresolved:number,manualAcceptanceRate:number|null,httpAttempts:number,latency:{p50Ms:number|null,p95Ms:number|null}}} Metrics
 * @typedef {{schemaVersion:'1.0',runId:string,createdAt:string,summaryOnly:boolean,provenance:{mode:'fixture'|'live',evidence:string,apiVersion:string,geography:string,datasetSha256:string,caseCount:number,options:RunOptions,applicationVersion:string},overall:Metrics,byStrategy:Record<string,Metrics>,byCategory?:Record<string,Metrics>,results?:Result[]}} Report
 * @typedef {{strategy:Strategy,top:number,signal?:AbortSignal}} SearchOptions
 * @typedef {{candidates:Candidate[],attempts:number,retryDelayMs:number}} SearchResult
 * @typedef {{mode:'fixture'|'live',apiVersion:string,geography:string,search:(row:AddressCase,options:SearchOptions)=>Promise<SearchResult>}} Provider
 */
export {};
