import os
import urllib.request
import tarfile
import shutil

url = "https://github.com/official-stockfish/Stockfish/releases/download/sf_16.1/stockfish-ubuntu-x86-64-avx2.tar"
filename = "stockfish.tar"

print("Downloading Linux Stockfish for Render...")
urllib.request.urlretrieve(url, filename)

print("Extracting...")
with tarfile.open(filename) as tar:
    tar.extractall()

print("Moving binary...")
os.makedirs("stockfish", exist_ok=True)
source_bin = "stockfish/stockfish-ubuntu-x86-64-avx2"
dest_bin = "stockfish/stockfish"

if os.path.exists(source_bin):
    shutil.move(source_bin, dest_bin)
    # Make executable
    os.chmod(dest_bin, 0o755)

if os.path.exists(filename):
    os.remove(filename)

print("Build complete!")
