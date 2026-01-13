import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

const RADIOLOGY_PEARLS = [
  "On CT urogram, the noncontrast phase is your stone detector - don't skip it when hematuria could be calculus-related.",
  "A renal lesion that increases >20 HU from unenhanced to post-contrast is true enhancement until proven otherwise; 10-20 HU is a gray zone and often needs MRI or CEUS.",
  "Small renal cysts can pseudoenhance ~5-10 HU on CT; place ROIs away from the wall and compare multiple phases before calling it solid.",
  "Always review coronal and sagittal reformats for ureteral stones; tiny UVJ stones are easy to miss on axial alone.",
  "The 'soft-tissue rim sign' favors a ureteral stone; the 'comet-tail sign' favors a pelvic phlebolith.",
  "Perinephric stranding + delayed nephrogram + ureteral dilation is a common trio of secondary signs for obstructive uropathy on contrast CT.",
  "Hydronephrosis without hydroureter suggests UPJ obstruction or an extrinsic crossing vessel - trace the ureter all the way to the bladder.",
  "If the renal pelvis looks dilated but calyces are sharp and non-dilated, consider an extrarenal pelvis rather than obstruction.",
  "Parapelvic/peripelvic cysts can mimic hydronephrosis on US; Doppler and CT/MRI help show separate non-communicating cysts.",
  "On ultrasound, a ureteral jet supports patency, but absence is nonspecific; persistent asymmetry plus hydronephrosis raises obstruction.",
  "Stone density (HU) and skin-to-stone distance on CT can help predict SWL success; very dense stones and long distances tend to fragment poorly.",
  "A staghorn calculus should trigger a quick look for infection complications: debris, calyceal dilation, and xanthogranulomatous pyelonephritis.",
  "In a calyceal diverticulum, 'milk of calcium' layers dependently and changes with patient position - unlike a fixed stone.",
  "In medullary nephrocalcinosis, think hyperparathyroidism, distal (type 1) RTA, or medullary sponge kidney; the calcification is in pyramids, not the collecting system.",
  "If you see nephrocalcinosis plus recurrent stones, describe the pattern: cortical (e.g., oxalosis) vs medullary (more common causes).",
  "On US, an echogenic focus with posterior shadowing and Doppler 'twinkling' is a stone until proven otherwise.",
  "A tiny obstructing stone may be missed; look for secondary signs like mild hydro, perinephric fluid/stranding, and a delayed nephrogram.",
  "UVJ stones like to hide at the intramural ureter; scrutinize the bladder base and UVJ on multiple planes.",
  "Don't call every renal pelvic calcification a stone; vascular calcifications and papillary tip calcifications can mimic calculi.",
  "With suspected stone + infection, look for pyonephrosis: collecting system debris/fluid level and a thick enhancing pelvic wall (or echoes/debris on US).",
  "A striated nephrogram (linear bands) is a clue to acute pyelonephritis, obstruction, or renal vein thrombosis - context is everything.",
  "Focal pyelonephritis often forms a wedge-shaped hypoenhancing region; if it persists or bulges the contour, consider an underlying mass.",
  "Renal abscess often shows 'rim enhancement' with a low-attenuation center; gas locules make the diagnosis easier.",
  "Emphysematous pyelonephritis is gas in renal parenchyma/perinephric space; emphysematous pyelitis is gas confined to the collecting system.",
  "Xanthogranulomatous pyelonephritis: think 'bear paw' (dilated calyces) plus a staghorn calculus and an enlarged poorly functioning kidney.",
  "Perinephric collections can be phlegmon vs abscess; a definable enhancing wall and restricted diffusion on MRI support abscess.",
  "In renal TB, look for calyceal irregularity, infundibular stenosis, papillary necrosis, and a small contracted 'thimble' bladder.",
  "Papillary necrosis can show 'ball-on-tee' or 'ring shadow' signs on urography/CTU; sloughed papillae can become filling defects.",
  "In fungal UTI, consider 'fungus balls': nonenhancing filling defects that can obstruct and mimic tumor.",
  "Emphysematous cystitis shows gas in the bladder wall; don't confuse it with simple intraluminal air after instrumentation.",
  "Prostatic abscess often has multiloculated fluid with rim enhancement on CT/MRI; on TRUS it's a hypoechoic/anechoic cavity.",
  "For suspected Fournier gangrene, CT findings that matter are fascial thickening and gas tracking along perineal/scrotal planes - map the extent.",
  "In epididymo-orchitis, hyperemia on color Doppler is key; torsion typically shows reduced or absent intratesticular flow.",
  "Testicular infarct often appears as a wedge-shaped avascular hypoechoic region; it can follow torsion or severe epididymitis.",
  "In renal transplant infection, compare to baseline; new perinephric fluid, graft swelling, and urothelial thickening raise concern.",
  "Any enhancing solid renal mass is RCC until proven otherwise; benign look-alikes exist, but the default mindset prevents misses.",
  "Macroscopic fat in a renal mass strongly suggests angiomyolipoma, especially when there's no calcification.",
  "Fat + calcification in a renal mass should raise concern for RCC rather than classic AML (AML rarely calcifies).",
  "A homogeneous renal lesion >70 HU on noncontrast CT is often a benign hemorrhagic/proteinaceous cyst; confirm no enhancement.",
  "On MRI, use subtraction (post-contrast minus pre-contrast) to confirm enhancement in hemorrhagic or proteinaceous lesions.",
  "In cystic renal lesions, an enhancing mural nodule is more concerning than thin septal enhancement; nodules drive management.",
  "Complex cyst calls are only as good as phase timing; nephrographic phase is the workhorse for small renal lesions.",
  "In RCC, always check the renal vein and IVC for tumor thrombus; look for expansile enhancing thrombus and collaterals.",
  "Bland thrombus usually doesn't enhance; if the thrombus enhances like the tumor, assume tumor thrombus.",
  "Oncocytoma can have a central scar, but scars are not specific; don't overcall benign based on one feature.",
  "Renal lymphoma often encases vessels without causing obstruction; multiple homogeneous hypoenhancing masses are a common pattern.",
  "Renal metastases are often small and multiple; in a cancer patient, don't reflexively label every enhancing lesion 'RCC'.",
  "A 'cortical rim sign' (thin peripheral enhancement) supports renal infarction and helps separate infarct from pyelonephritis.",
  "Renal infarct tends to be sharply wedge-shaped with minimal collecting system involvement; pyelonephritis often has more stranding/urothelial thickening.",
  "Segmental renal artery occlusion can mimic a mass; look for a perfusion defect that respects vascular territories.",
  "In medullary sponge kidney, look for linear 'paintbrush' contrast in papillary ducts on excretory images and associated tiny stones.",
  "A calyceal diverticulum can mimic a cyst; excretory-phase opacification of the cavity is the giveaway.",
  "If a renal sinus 'mass' enhances like vessels, think prominent pelvis/vascular structure; confirm on multiplanar views.",
  "In ADPKD, scan for liver cysts and remember intracranial aneurysm risk is syndromic, not incidental.",
  "For suspected renal artery stenosis, an asymmetric small kidney with cortical thinning and delayed enhancement is a strong clue.",
  "For upper tract urothelial carcinoma, excretory phase is essential; lesions may be subtle wall thickening or filling defects.",
  "A blood clot is typically nonenhancing and may move or layer; a urothelial tumor enhances and is fixed to the wall.",
  "If a ureter segment doesn't opacify on CTU, don't accept it; add delayed images, hydration, or prone positioning to coat the urothelium.",
  "Focal irregular ureteral narrowing with proximal hydro is suspicious for tumor; long-segment smooth tapering often favors benign stricture/inflammation.",
  "In bladder cancer staging, perivesical fat stranding is not the same as frank extravesical tumor; look for a discrete mass beyond the wall.",
  "An underdistended bladder can fake wall thickening; assess distention before calling cystitis or tumor.",
  "Tiny bladder tumors can hide at the trigone/bladder neck; inspect the ureteral orifices and base on multiple planes.",
  "With chronic catheterization/inflammation, wall thickening is common; prioritize focal enhancing masses or nodules for malignancy.",
  "After TURBT, inflammation can mimic residual tumor; diffusion and early enhancement can help, but timing/history matters.",
  "A ureterocele is the 'cobra head' filling defect at the UVJ; look for a duplicated system and upper pole obstruction.",
  "Duplicated systems follow Weigert-Meyer: upper pole ureter tends to obstruct (often ectopic); lower pole ureter tends to reflux.",
  "Posterior urethral valves: the 'keyhole sign' (dilated posterior urethra + bladder) is a classic clue on VCUG/US.",
  "In suspected VUR, cortical scarring plus a small kidney suggests chronic reflux nephropathy.",
  "Horseshoe kidney sits low with malrotated collecting systems; increased risk of stones and UPJ obstruction - check for an isthmus.",
  "Retroperitoneal fibrosis often causes medial deviation/encasement of ureters; look for a plaque around the aorta/iliacs.",
  "Fibrosis-related obstruction often tapers smoothly; malignancy-related obstruction is more irregular/nodular.",
  "A pelvic kidney can masquerade as renal agenesis; always search the pelvis before declaring a kidney absent.",
  "With a solitary kidney in a male, look for genital tract variants (e.g., seminal vesicle/vas anomalies); urinary and reproductive development are linked.",
  "Hydroureteronephrosis with enhancing ureteral wall thickening can be impacted stone, infection, or tumor; excretory phase and clinical context help.",
  "In renal trauma, delayed excretory images are the urine-leak detector; extravasation can be invisible on early phases.",
  "A perinephric collection that opacifies on delayed CT is a urinoma until proven otherwise.",
  "Active arterial extravasation is a bright blush that grows or changes shape between phases; don't confuse it with pseudoaneurysm.",
  "A pseudoaneurysm is a round arterial-enhancing focus that persists; classic delayed hematuria after partial nephrectomy or trauma.",
  "Bladder rupture: intraperitoneal contrast outlines bowel loops; extraperitoneal gives flame-shaped perivesical leak on cystography.",
  "After cystectomy with ileal conduit, mild hydronephrosis can be seen early; worsening dilation or delayed nephrogram suggests anastomotic stricture.",
  "Ureteral injury after pelvic surgery often declares itself on delayed images: contrast leak, urinoma, or abrupt ureteral cutoff.",
  "After renal ablation, a thin smooth enhancing rim can be inflammatory; nodular or eccentric enhancement suggests residual tumor.",
  "Post-procedure hemorrhage can mimic tumor on MRI; T1 hyperintensity is your 'blood' clue.",
  "After prostate biopsy, hemorrhage can obscure lesions on T2/DWI; mpMRI is often cleaner after the hemorrhage clears.",
  "PI-RADS mindset: peripheral zone cancer is often T2 dark with diffusion restriction; transition zone cancer is often a 'smudgy' low-signal lesion disrupting BPH nodules.",
  "Always cross-check DWI/ADC against T2; T2 dark without restriction is commonly prostatitis, scar, or post-biopsy change.",
  "Extraprostatic extension clues include capsular bulge, irregular capsule, neurovascular bundle asymmetry, and long tumor-capsule contact.",
  "Seminal vesicle invasion is suggested by low signal and diffusion restriction extending into the SV with loss of normal architecture.",
  "Don't forget bones and nodes on prostate MRI; a single obvious osseous lesion can be the key finding.",
  "On scrotal US, 'intratesticular mass = malignant until proven otherwise'; extratesticular masses are more often benign.",
  "A new isolated right-sided varicocele is a red flag; look for IVC obstruction or a retroperitoneal/renal mass.",
  "Torsion can be missed if you only look at intratesticular flow; scan the spermatic cord for the 'whirlpool sign'.",
  "In torsion-detorsion, flow may be present; heterogeneous testis, reactive hydrocele, and twisted cord still matter.",
  "Testicular rupture shows disrupted tunica albuginea and extruded heterogeneous parenchyma; hematocele often accompanies it.",
  "An adenomatoid tumor is a common benign epididymal mass: solid, well-circumscribed, and usually painless.",
  "In priapism, Doppler helps: non-ischemic (high-flow) shows high arterial inflow; ischemic shows minimal/absent cavernosal flow.",
  "Peyronie disease can be mapped on US: echogenic plaques with shadowing; Doppler can assess associated vascular changes.",
  "On CTU, a hyperdense focus in the renal pelvis on noncontrast that disappears on contrast images can be concentrated urine; confirm with delayed excretory phase before calling a stone.",
  "Physiologic hydronephrosis of pregnancy is typically right-sided and smooth; an abrupt ureteral cutoff or disproportionate pain should prompt a careful distal ureter search.",
  "On contrast CT, a 'persistent nephrogram' (kidney stays dense on delayed images) suggests severe obstruction, hypotension, or acute tubular injury—interpret with clinical context.",
  "An enhancing urothelial lesion is easiest to see against opacified urine; add a late excretory delay if the collecting system isn't well coated.",
  "Use window/level adjustments for stones: a wider window often reveals tiny calcifications that vanish on soft-tissue settings.",
  "When evaluating a suspected UPJ obstruction, look for a crossing lower pole artery/vein on arterial phase or CTA; it can change surgical planning.",
  "In a dilated collecting system, check for calyceal ballooning versus pelvic-only dilation; calyceal dilation supports true obstruction.",
  "On ultrasound, mild pelviectasis that resolves after the patient voids is often physiologic; persistent dilation post-void is more suspicious.",
  "Bladder post-void residual on ultrasound can explain bilateral hydronephrosis; measure it when the story is retention/weak stream.",
  "In neurogenic bladder, look for trabeculation and diverticula; diverticula can hide tumors and stones.",
  "Bladder diverticula: a mass within a diverticulum is easier to miss because the wall is thin—scrutinize for focal enhancing nodules.",
  "A urachal remnant appears as a midline tubular or cystic structure from the bladder dome to umbilicus; calcifications in a urachal mass raise concern for malignancy.",
  "Gas in the bladder lumen alone is often iatrogenic; gas in the bladder wall is emphysematous cystitis until proven otherwise.",
  "In suspected colovesical fistula, look for air in the bladder without instrumentation plus focal bladder wall thickening adjacent to inflamed sigmoid colon.",
  "An enterovesical fistula can be subtle—oral contrast in the bladder on delayed imaging is a strong confirmatory clue.",
  "For hematuria workup, always inspect the renal papillae for tiny urothelial lesions; early filling defects can vanish once the system fully opacifies.",
  "Upper tract TCC often causes mild, disproportionate hydronephrosis relative to lesion size; wall thickening can be the only sign.",
  "Ureteritis cystica can mimic tumor with multiple tiny filling defects; the key is their uniform, small, benign-appearing pattern.",
  "In ureteral stricture, measure length on coronal MPR; short segments behave differently than long strictures clinically.",
  "Radiation-induced ureteral strictures often occur in distal ureter and are long and smooth; note prior pelvic RT when you see this pattern.",
  "Endometriosis can cause extrinsic ureteral compression; look for deep infiltrating endometriosis in the pelvis when distal obstruction is unexplained.",
  "On MRI for urethral diverticulum, T2 bright fluid with a 'neck' to the urethra is classic; post-contrast helps identify infected diverticula or tumors.",
  "Female urethral diverticula can harbor stones—tiny dependent signal voids or echogenic foci within the sac are a clue.",
  "On VCUG, reflux into a dilated ureter with clubbed calyces suggests longstanding VUR; document laterality and grade for management.",
  "DMSA renal scan is the scarring map in pediatric UTI; cortical defects that persist on delayed images support true scars.",
  "On MAG3 diuretic renography, a rising curve after Lasix suggests obstruction; a prompt washout supports non-obstructed dilation.",
  "Always check for duplicated collecting system when you see two ureteric jets on ultrasound or two ureters on CT.",
  "An ectopic ureter in a duplex system often drains the upper pole; in girls, persistent dribbling with a normal voiding pattern is a classic clinical pairing.",
  "With suspected ectopic ureter, MR urography (static fluid + excretory) can localize insertion when CT is nondiagnostic.",
  "A dilated ureter behind the bladder that doesn't enter the trigone can be an ectopic insertion—trace it to the endpoint.",
  "In posterior urethral valves, look for thick-walled bladder and bilateral hydronephrosis; the posterior urethra is the target area on VCUG.",
  "Prune belly syndrome: massively dilated urinary tract plus deficient abdominal wall—describe degree of ureteral dilation and renal dysplasia signs.",
  "Multicystic dysplastic kidney shows noncommunicating cysts and absent normal parenchyma; the contralateral kidney deserves careful survey for anomalies.",
  "In suspected renal dysplasia, look for echogenic small kidney with poor corticomedullary differentiation; correlate with function if needed.",
  "Hydronephrosis with a dilated proximal ureter but normal distal ureter suggests a mid-ureteral crossing vessel or stricture; identify the transition point.",
  "A retrocaval ureter (circumcaval) causes a 'fishhook' or S-shaped proximal ureter on imaging; it's a right-sided classic.",
  "In renal failure, a noncontrast MRI (T2 + DWI) can still characterize many masses; don't assume contrast is mandatory.",
  "On DWI, abscesses restrict strongly; necrotic tumors may restrict peripherally—match diffusion to enhancement pattern.",
  "Restricted diffusion in the prostate can be mimicked by hemorrhage or prostatitis; confirm on T1 and correlate with symptoms/PSA trends.",
  "Post-prostatectomy, a small enhancing nodule at the vesicourethral anastomosis is a common recurrence pattern; compare to PSA rise timing.",
  "On PSMA PET, sympathetic chain ganglia (celiac, stellate) commonly show uptake; their elongated shape and typical location prevent false node calls.",
  "RCC metastases can be hypervascular; arterial phase may reveal lesions that are occult on portal venous phase.",
  "In staging RCC, scrutinize the ipsilateral adrenal; direct invasion is uncommon but important when present.",
  "A small enhancing lesion in the contralateral kidney in RCC patient may be synchronous primary; describe separately from metastasis assumptions.",
  "Renal sinus invasion in RCC can be subtle; look for tumor extending into sinus fat and collecting system distortion.",
  "Perinephric fat stranding alone does not equal T3a in RCC; focal nodular fat invasion is more convincing than hazy stranding.",
  "Collecting system invasion can present as hematuria and filling defects; excretory phase can show tumor protruding into calyces.",
  "In AML, intratumoral aneurysms >5 mm raise hemorrhage risk; describe them if seen on contrast studies.",
  "Spontaneous perirenal hemorrhage (Wunderlich) should trigger a search for underlying tumor, especially AML or RCC.",
  "A renal pseudoaneurysm after biopsy/partial nephrectomy may only show on arterial phase; look for a round enhancing focus with a feeding artery.",
  "Delayed hematuria after renal intervention: think pseudoaneurysm or AV fistula; Doppler can show high-velocity turbulent flow.",
  "Renal AV fistula on Doppler shows color aliasing and arterialized venous waveform; CT angiography can confirm anatomy.",
  "In renal transplant, a rising resistive index is nonspecific; compare trend and pair with grayscale findings and clinical data.",
  "Transplant hydronephrosis can be from ureteral kinking, stricture, or lymphocele; look for a peritransplant fluid collection compressing ureter.",
  "A lymphocele is typically a simple fluid collection near transplant vessels; infected collections develop septations or enhancing walls.",
  "After pelvic lymph node dissection, a lymphocele can mimic abscess; rim enhancement and gas favor infection.",
  "In acute urinary retention, bilateral hydroureteronephrosis plus bladder distention is a pattern; checking bladder volume saves time.",
  "A markedly thickened bladder wall with small capacity suggests chronic outlet obstruction or neurogenic bladder; correlate with trabeculation.",
  "Bladder stones often sit dependently and may change position; prone imaging can separate stones from fixed mural lesions.",
  "Intravesical clot can mimic tumor; a nonenhancing, layered, or mobile filling defect supports clot.",
  "On MRI, clot is often T1 bright and does not enhance; tumor enhances and often restricts diffusion.",
  "Hydronephrosis with ureteral wall enhancement and periureteral stranding can be impacted stone, infection, or tumor; don't label tumor without a focal mass.",
  "Ketorolac/NSAID-related papillary necrosis can present with hematuria; look for sloughed papillae as filling defects in excretory phase.",
  "Analgesic nephropathy can cause small kidneys and papillary calcifications; cortical scarring pattern can support chronicity.",
  "In sickle cell disease, papillary necrosis and renal medullary carcinoma are key differentials; an infiltrative medullary mass warrants urgency.",
  "Renal medullary carcinoma often arises in the collecting system region and is aggressive; look for infiltrative central mass and early metastases.",
  "Urothelial carcinoma can present as subtle focal calyceal amputation; compare calyceal outlines side-to-side on excretory images.",
  "A calyx that suddenly ends ('amputation') suggests an intraluminal lesion or infundibular stenosis; tumors and TB are classic causes.",
  "Don't forget to evaluate the renal arteries when the kidney is infarcted; a dissection flap or embolic occlusion may be visible.",
  "Renal vein thrombosis can cause an enlarged kidney with decreased enhancement and perinephric edema; direct thrombus in the vein seals the diagnosis.",
  "Nutcracker phenomenon: dilated left renal vein with collateralization and hematuria; look for compression between SMA and aorta.",
  "In varicocele evaluation, measure vein caliber and use Valsalva; augmentation with Valsalva supports true varicocele.",
  "A left-sided varicocele with left renal mass raises concern for renal vein invasion or compression; check the left renal vein carefully.",
  "An epidermoid cyst shows an 'onion-skin' lamellated appearance and avascularity; recognizing it can prevent overtreatment.",
  "A burned-out testicular tumor can present as a small scar with calcification and metastatic retroperitoneal nodes; always correlate testes when nodes are unexplained.",
  "Retroperitoneal nodes from testicular cancer track along gonadal vessels; scan from renal hilum to iliac bifurcation carefully.",
  "In scrotal trauma, a testicular fracture line may be subtle; look for linear hypoechoic cleft with preserved tunica.",
  "Hematoma is typically avascular on Doppler; any internal vascularity suggests viable tissue or a mass rather than pure blood.",
  "Segmental testicular torsion can occur; compare flow regionally, not just globally, especially if symptoms are focal.",
  "Scrotal wall edema with normal testis can still be cellulitis; look for subcutaneous gas if concern for necrotizing infection.",
  "In penile fracture, ultrasound can show tunica albuginea disruption and hematoma; MRI is excellent when US is equivocal.",
  "Mondor disease (superficial dorsal vein thrombosis) shows a noncompressible thrombosed vein on Doppler; it can mimic a palpable cord.",
  "In urethral stricture disease, retrograde urethrogram measures length; MRI/US can add spongiofibrosis extent when needed for planning.",
  "On CT, a distended seminal vesicle with surrounding inflammation can mimic abscess; correlate with prostatitis/ejaculatory duct obstruction.",
  "Ejaculatory duct obstruction can present with dilated seminal vesicles and midline prostatic cyst; MRI can show the obstructing lesion.",
  "A midline prostatic utricle cyst is associated with hypospadias and intersex variants; a Mullerian duct cyst is usually larger and extends above the prostate.",
  "On CT, asymmetric enlargement and hyperenhancement of the seminal vesicle can indicate invasion from prostate cancer; compare sides.",
  "In bladder outlet obstruction, intravesical prostatic protrusion can look like a bladder mass; continuity with prostate on sagittal images clarifies it.",
  "A median lobe can create a 'ball-valve' effect at the bladder neck; describing protrusion helps urologic decision-making.",
  "After pelvic radiation, the bladder may show diffuse thickening and decreased capacity; focal enhancing masses still require tumor exclusion.",
  "Ureteral stents can cause apparent wall thickening and periureteral stranding; interpret suspected ureteritis/tumor with caution in stented ureters.",
  "On KUB, stent position is quick to assess: proximal curl in renal pelvis, distal curl in bladder; a straightened curl suggests migration.",
  "In stented systems, mild hydro can persist; worsening dilation plus decreased drainage suggests stent malfunction or encrustation.",
  "Encrusted stents can show calcification along the stent course; look at both ends where encrustation is commonest.",
  "After ureteroscopy, small ureteral wall edema can narrow the lumen; short-term mild hydroureter is common—look for a clear obstructing lesion before calling stricture.",
  "In suspected ureteral perforation, periureteral contrast on delayed images is key; early phases may miss the leak.",
  "After cystoscopy/TURP, intravesical air and mild wall thickening can be expected; new extraluminal air or fluid suggests complication.",
  "On CT for hematuria, don't ignore the aorta/iliacs: an aortoiliac aneurysm can cause ureteral obstruction or fistula risk after stenting.",
  "A uretero-arterial fistula is rare but deadly; in a patient with stent + pelvic surgery/RT and brisk hematuria, look for subtle arterial blush or pseudoaneurysm.",
  "In suspected renal colic with normal CT, consider non-urinary mimics: appendicitis, diverticulitis, ovarian torsion—document alternate diagnoses when seen.",
];

const CYCLE_INTERVAL_MS = 9000;

interface LoadingPearlsProps {
  className?: string;
}

export function LoadingPearls({ className = "" }: LoadingPearlsProps) {
  const [currentIndex, setCurrentIndex] = useState(() => 
    Math.floor(Math.random() * RADIOLOGY_PEARLS.length)
  );
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let fadeOutTimer: ReturnType<typeof setTimeout>;
    let fadeInTimer: ReturnType<typeof setTimeout>;

    const scheduleCycle = () => {
      fadeOutTimer = setTimeout(() => {
        setIsVisible(false);
        
        fadeInTimer = setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % RADIOLOGY_PEARLS.length);
          setIsVisible(true);
          scheduleCycle();
        }, 300);
      }, CYCLE_INTERVAL_MS - 300);
    };

    scheduleCycle();

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(fadeInTimer);
    };
  }, []);

  const currentPearl = RADIOLOGY_PEARLS[currentIndex];

  return (
    <div className={`flex flex-col items-center justify-center p-8 ${className}`} data-testid="loading-pearls">
      <div className="flex items-center gap-3 mb-6">
        <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner" />
        <span className="text-sm font-medium text-muted-foreground">Loading...</span>
      </div>
      
      <div className="max-w-md text-center">
        <p 
          className={`text-sm leading-relaxed text-muted-foreground transition-opacity duration-300 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
          data-testid="loading-pearl-text"
        >
          {currentPearl}
        </p>
      </div>
      
      <div className="flex gap-1 mt-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"
            style={{
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
