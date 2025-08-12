#!/usr/bin/env node

/**
 * Migration script to replace static MUI icon imports with dynamic imports
 * Run with: node scripts/migrate-mui-icons.js
 */

const fs = require('fs');
const path = require('path');

// Files to migrate with their icon mappings
const FILES_TO_MIGRATE = [
  {
    path: 'src/pages/NotFound.tsx',
    imports: [{ old: 'Home as HomeIcon', new: 'Home' }],
    replacements: [{ old: '<HomeIcon', new: '<Icon name="Home"' }]
  },
  {
    path: 'src/components/WebSocketStatus.tsx',
    imports: [{ old: 'FiberManualRecord', new: 'FiberManualRecord' }],
    replacements: [{ old: '<FiberManualRecord', new: '<Icon name="FiberManualRecord"' }]
  },
  {
    path: 'src/pages/Products/index.tsx',
    imports: [
      { old: 'Add, Edit, Delete, Sync, Close', new: '' }
    ],
    replacements: [
      { old: '<Add', new: '<Icon name="Add"' },
      { old: '<Edit', new: '<Icon name="Edit"' },
      { old: '<Delete', new: '<Icon name="Delete"' },
      { old: '<Sync', new: '<Icon name="Sync"' },
      { old: '<Close', new: '<Icon name="Close"' }
    ]
  },
  {
    path: 'src/components/WebSocketStatus/index.tsx',
    imports: [{ old: 'FiberManualRecord', new: 'FiberManualRecord' }],
    replacements: [{ old: '<FiberManualRecord', new: '<Icon name="FiberManualRecord"' }]
  },
  {
    path: 'src/components/SyncStatusCard/index.tsx',
    imports: [{ old: 'Sync, CheckCircle, Error, Schedule', new: '' }],
    replacements: [
      { old: '<Sync', new: '<Icon name="Sync"' },
      { old: '<CheckCircle', new: '<Icon name="CheckCircle"' },
      { old: '<Error', new: '<Icon name="Error"' },
      { old: '<Schedule', new: '<Icon name="Schedule"' }
    ]
  },
  {
    path: 'src/components/Dialogs/InventoryAdjustDialog.tsx',
    imports: [{ old: 'Add, Remove', new: '' }],
    replacements: [
      { old: '<Add', new: '<Icon name="Add"' },
      { old: '<Remove', new: '<Icon name="Remove"' }
    ]
  },
  {
    path: 'src/components/monitoring/PerformanceMonitor.tsx',
    imports: [{ old: 'Close, Speed, Memory, Schedule', new: '' }],
    replacements: [
      { old: '<Close', new: '<Icon name="Close"' },
      { old: '<Speed', new: '<Icon name="Speed"' },
      { old: '<Memory', new: '<Icon name="Memory"' },
      { old: '<Schedule', new: '<Icon name="Schedule"' }
    ]
  },
  {
    path: 'src/components/StatCard/index.tsx',
    imports: [
      { old: 'TrendingUp, TrendingDown', new: '' },
      { old: 'Circle', new: '' }
    ],
    replacements: [
      { old: '<TrendingUp', new: '<Icon name="TrendingUp"' },
      { old: '<TrendingDown', new: '<Icon name="TrendingDown"' },
      { old: '<Circle', new: '<Icon name="Circle"' }
    ]
  },
  {
    path: 'src/components/common/ErrorBoundary/index.tsx',
    imports: [{ old: 'Error as ErrorIcon', new: 'Error' }],
    replacements: [{ old: '<ErrorIcon', new: '<Icon name="Error"' }]
  }
];

function migrateFile(filePath, imports, replacements) {
  const fullPath = path.join(__dirname, '../packages/frontend', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Remove old MUI icon imports
  const muiIconImportRegex = /import\s+\{[^}]*\}\s+from\s+['"]@mui\/icons-material['"];?\n?/g;
  content = content.replace(muiIconImportRegex, '');
  
  // Add new Icon import after other MUI imports
  const muiMaterialImportIndex = content.indexOf("from '@mui/material'");
  if (muiMaterialImportIndex > -1) {
    const insertIndex = content.indexOf('\n', muiMaterialImportIndex) + 1;
    const iconImport = "import Icon from '@/components/common/Icon';\n";
    if (!content.includes("import Icon from '@/components/common/Icon'")) {
      content = content.slice(0, insertIndex) + iconImport + content.slice(insertIndex);
    }
  }
  
  // Apply replacements
  replacements.forEach(({ old, new: newStr }) => {
    const regex = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    content = content.replace(regex, newStr);
  });
  
  // Write the updated content
  fs.writeFileSync(fullPath, content);
  console.log(`✅ Migrated: ${filePath}`);
}

function main() {
  console.log('🚀 Starting MUI Icons Migration...\n');
  
  FILES_TO_MIGRATE.forEach(({ path, imports, replacements }) => {
    migrateFile(path, imports, replacements);
  });
  
  console.log('\n✨ Migration completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Review the changes in each file');
  console.log('2. Test your application to ensure all icons render correctly');
  console.log('3. Consider preloading commonly used icons in your app initialization');
  console.log('4. Run your build to ensure no import errors');
}

if (require.main === module) {
  main();
}

module.exports = { migrateFile, FILES_TO_MIGRATE };