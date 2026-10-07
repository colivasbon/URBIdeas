# Driver desatendido de oleadas Fase 3 (cargas reanudables por lotes).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\incideas\fase3\driver-oleada.ps1 `
#     -Orden tmp\oleada2\orden.txt -Edicion oleada-2
#
# Carga los lotes en el orden de orden.txt con --continuar --go (idempotente
# y reanudable). Antes de cada lote comprueba el fichero STOP (por defecto
# tmp\<carpeta>\STOP): si existe, termina sin cargar el siguiente. Un lote
# terminado sin error se marca con .hecho y se salta en un relanzamiento.
# Al acabar todos los lotes (sin STOP), ejecuta la QA completa; si pasa,
# sella la snapshot como aprobada. Con -SinCierre se omite ese cierre.

param(
  [Parameter(Mandatory = $true)][string]$Orden,
  [string]$Edicion = "oleada-2",
  [switch]$SinCierre
)

$ErrorActionPreference = "Continue"
$raiz = Resolve-Path "$PSScriptRoot\..\..\.."
Set-Location $raiz
$dir = Split-Path -Parent (Resolve-Path $Orden)
$Stop = Join-Path $dir "STOP"
$Log = Join-Path $dir "drv.log"

function Anota([string]$texto) {
  $linea = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $texto
  Add-Content -LiteralPath $Log -Value $linea -Encoding UTF8
  Write-Host $linea
}

Anota ("INICIO driver oleada {0} (orden {1})" -f $Edicion, $Orden)
foreach ($loteRuta in Get-Content -LiteralPath $Orden) {
  $lote = $loteRuta.Trim()
  if (-not $lote) { continue }
  if (Test-Path -LiteralPath $Stop) { Anota "STOP detectado: fin limpio antes de $lote"; exit 0 }
  $hecho = [System.IO.Path]::ChangeExtension($lote, ".hecho")
  if (Test-Path -LiteralPath $hecho) { Anota "salto $lote (ya hecho)"; continue }
  Anota "INICIO $lote"
  & npx tsx scripts/incideas/fase3/cargar-muestra.ts --desde-archivo $lote --continuar --go --edicion-oleada $Edicion *>> $Log
  $code = $LASTEXITCODE
  Anota ("FIN {0} error={1}" -f $lote, $code)
  if ($code -ne 0) {
    Anota "ERROR en $lote: sin .hecho; el driver se detiene (relanzar reanuda con --continuar)"
    exit $code
  }
  New-Item -ItemType File -Path $hecho -Force | Out-Null
}

Anota "FIN driver: todos los lotes procesados"
if ($SinCierre) { Anota "Cierre omitido (-SinCierre)"; exit 0 }

Anota "CIERRE: QA completa"
& npx tsx scripts/tests/incideas-fase3-qa.ts *>> $Log
$qa = $LASTEXITCODE
Anota ("CIERRE: QA error={0}" -f $qa)
if ($qa -ne 0) { Anota "CIERRE: QA bloquea; NO se sella. Reintentar fallos y relanzar"; exit $qa }

Anota "CIERRE: sello de snapshot (aprobada)"
& npx tsx scripts/incideas/fase3/sellar-snapshot.ts --aprobar --nota ("Oleada {0} completada; QA sin bloqueos" -f $Edicion) *>> $Log
$sello = $LASTEXITCODE
Anota ("CIERRE: sello error={0}" -f $sello)
exit $sello
