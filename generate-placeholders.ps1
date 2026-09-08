# generate-placeholders.ps1
# Generates simple SVG placeholder files for furniture sprites.

$spriteDir = "C:\Users\Admin\room-designer\assets\sprites"

# Define items per category with their names and fill colors
$categories = @{
    "chairs" = @(
        @{name="office-chair"; color="#8B6914"},
        @{name="dining-chair"; color="#8B6914"},
        @{name="armchair"; color="#8B6914"},
        @{name="bean-bag"; color="#8B6914"},
        @{name="stool"; color="#8B6914"}
    )
    "tables" = @(
        @{name="desk"; color="#A0522D"},
        @{name="dining-table"; color="#A0522D"},
        @{name="coffee-table"; color="#A0522D"},
        @{name="side-table"; color="#A0522D"},
        @{name="nightstand"; color="#A0522D"}
    )
    "beds" = @(
        @{name="single-bed"; color="#4A6FA5"},
        @{name="double-bed"; color="#4A6FA5"},
        @{name="queen-bed"; color="#4A6FA5"},
        @{name="bunk-bed"; color="#4A6FA5"},
        @{name="couch"; color="#4A6FA5"}
    )
    "shelves" = @(
        @{name="bookshelf"; color="#6B4226"},
        @{name="wall-shelf"; color="#6B4226"},
        @{name="tv-stand"; color="#6B4226"},
        @{name="wardrobe"; color="#6B4226"},
        @{name="shoe-rack"; color="#6B4226"}
    )
    "decor" = @(
        @{name="floor-lamp"; color="#2E8B57"},
        @{name="table-lamp"; color="#2E8B57"},
        @{name="plant-pot"; color="#2E8B57"},
        @{name="rug"; color="#2E8B57"},
        @{name="picture-frame"; color="#2E8B57"}
    )
}

# Function to generate SVG content
function Generate-Svg {
    param(
        [string]$name,
        [string]$color
    )

    # Format name for display (replace hyphens with spaces, capitalize)
    $displayName = $name.Replace("-", " ").ToUpper()

    return @"
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
    <!-- Background -->
    <rect width="100%" height="100%" fill="white"/>
    
    <!-- Main shape -->
    <rect x="10" y="10" width="108" height="108" rx="15" ry="15" fill="$color"/>
    
    <!-- Item name -->
    <text x="64" y="68" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">$displayName</text>
</svg>
"@
}

# Create directories and SVG files
foreach ($category in $categories.Keys) {
    $categoryDir = Join-Path -Path $spriteDir -ChildPath $category
    
    # Ensure directory exists
    if (-not (Test-Path -Path $categoryDir -PathType Container)) {
        New-Item -ItemType Directory -Path $categoryDir -Force | Out-Null
        Write-Host "Created directory: $categoryDir"
    }
    
    # Generate SVG files for each item
    foreach ($item in $categories[$category]) {
        $svgPath = Join-Path -Path $categoryDir -ChildPath "$($item.name).svg"
        $svgContent = Generate-Svg -name $item.name -color $item.color
        
        # Write SVG file
        $svgContent | Out-File -FilePath $svgPath -Encoding UTF8
        Write-Host "Created: $svgPath"
    }
}

Write-Host "`nAll SVG placeholder files have been generated successfully!"
