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
];

const CYCLE_INTERVAL_MS = 6000;

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
    let cycleTimer: ReturnType<typeof setTimeout>;

    const runCycle = () => {
      fadeOutTimer = setTimeout(() => {
        setIsVisible(false);
        
        fadeInTimer = setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % RADIOLOGY_PEARLS.length);
          setIsVisible(true);
        }, 300);
      }, CYCLE_INTERVAL_MS - 300);
      
      cycleTimer = setTimeout(runCycle, CYCLE_INTERVAL_MS);
    };

    cycleTimer = setTimeout(runCycle, CYCLE_INTERVAL_MS);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(fadeInTimer);
      clearTimeout(cycleTimer);
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
