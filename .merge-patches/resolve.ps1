param([string]$Path)
$lines = [System.IO.File]::ReadAllLines($Path, [System.Text.UTF8Encoding]::new($false))
$output = New-Object System.Collections.Generic.List[string]
$i = 0
while ($i -lt $lines.Count) {
    $line = $lines[$i]
    if ($line -like '<<<<<<<*') {
        $i++
        $phase = 'main'
        $aBlock = @()
        while ($i -lt $lines.Count -and $lines[$i] -notlike '>>>>>>>*') {
            if ($lines[$i] -eq '=======') {
                $phase = 'a'
            } elseif ($phase -eq 'a') {
                $aBlock += $lines[$i]
            }
            $i++
        }
        $i++
        foreach ($x in $aBlock) { $output.Add($x) }
    } else {
        $output.Add($line)
        $i++
    }
}
[System.IO.File]::WriteAllLines($Path, $output, [System.Text.UTF8Encoding]::new($false))
$remaining = ([System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false)) -split '<<<<<<<').Count - 1
"remaining conflicts: $remaining"
