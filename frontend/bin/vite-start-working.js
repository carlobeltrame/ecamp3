const { exec } = require('child_process')

console.log('Actually, vite is lying to you about being ready.')

// Fetch the start page to force vite to start bundling stuff immediately
const url = process.argv.slice(-1)[0]
exec(
  'wget -O/home/node/vite-output -q --recursive --page-requisites --adjust-extension --restrict-file-names=unix --domains localhost --no-parent ' +
    url,
  (error, stdout, stderr) => {
    if (error) {
      console.error(error.message)
      return
    }
    if (stderr) {
      console.error(stderr)
      return
    }
    console.log(stdout)
  }
)
