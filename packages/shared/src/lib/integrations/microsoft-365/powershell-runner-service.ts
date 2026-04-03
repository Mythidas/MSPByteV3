export class PowerShellRunnerService {
  private static readonly TIMEOUT_MS = 60_000;

  /**
   * Run an Exchange Online cmdlet using app-only certificate auth.
   * @param clientId Azure AD app client ID
   * @param certPem PEM-encoded private key (from ENV)
   * @param organization Customer tenant domain or tenant ID
   * @param cmdlet Exchange Online cmdlet to run (e.g. "Get-OrganizationConfig")
   */
  static async runExchangeOnline(
    clientId: string,
    certPem: string,
    organization: string,
    cmdlet: string,
  ): Promise<unknown> {
    // Write the PEM to a temp file using [System.IO.Path]::GetTempFileName() in PS
    // to avoid passing secrets via args or env beyond what's needed
    const script = `
$ErrorActionPreference = 'Stop'

# Write cert PEM from env to a temp file
$certPath = [System.IO.Path]::GetTempFileName() + '.pem'
[System.IO.File]::WriteAllText($certPath, $env:PS_PARAM_CERT_PEM)

try {
  $pemContent = Get-Content $certPath -Raw

  $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem(
    $pemContent,    # certPem
    $pemContent     # keyPem — .NET will extract the key block from here
  )

  Connect-ExchangeOnline \`
    -AppId $env:PS_PARAM_CLIENT_ID \`
    -Certificate $cert \`
    -Organization $env:PS_PARAM_ORGANIZATION \`
    -ShowBanner:$false

  ${cmdlet} | ConvertTo-Json -Depth 10
} finally {
  if (Test-Path $certPath) { Remove-Item $certPath -Force }
  try { Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue } catch {}
}
`.trim();

    return PowerShellRunnerService.run(script, {
      CLIENT_ID: clientId,
      CERT_PEM: certPem,
      ORGANIZATION: organization,
    });
  }

  private static async run(
    script: string,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const { spawn } = await import("child_process");

    const env: Record<string, string | undefined> = { ...process.env };
    for (const [key, value] of Object.entries(params)) {
      env[`PS_PARAM_${key.toUpperCase()}`] = value;
    }

    return new Promise((resolve, reject) => {
      const ps = spawn(
        "pwsh",
        ["-NonInteractive", "-NoProfile", "-Command", script],
        {
          env,
          timeout: PowerShellRunnerService.TIMEOUT_MS,
        },
      );

      let stdout = "";
      let stderr = "";

      ps.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      ps.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      ps.on("close", (code: number | null) => {
        if (code !== 0) {
          reject(
            new Error(
              `PowerShell exited with code ${code}. stderr: ${stderr.slice(0, 500)}`,
            ),
          );
          return;
        }

        try {
          resolve(stdout.trim() ? JSON.parse(stdout) : null);
        } catch {
          reject(
            new Error(
              `Failed to parse PowerShell JSON output: ${stdout.slice(0, 500)}`,
            ),
          );
        }
      });

      ps.on("error", (err: Error) => {
        reject(new Error(`Failed to spawn pwsh: ${err.message}`));
      });
    });
  }
}
