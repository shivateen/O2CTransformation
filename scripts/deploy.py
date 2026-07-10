#!/usr/bin/env python3
"""
deploy.py — Build ProcessIQ and publish the demo to GitHub Pages.

Runs the normal build, then pushes ONLY the built files in public/
(index.html, processiq.html, .nojekyll) to the `gh-pages` branch — the source,
the .pptx and the .xlsx are never published.

Uses a throwaway git worktree, so your current branch and working tree are
left completely untouched.

  python scripts/deploy.py          (or: npm run deploy)

Live site: https://shivateen.github.io/Process_Transformation2.1/
"""
import os, sys, shutil, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
TMP = os.path.join(ROOT, ".deploy-gh-pages")
BRANCH = "gh-pages"
URL = "https://shivateen.github.io/Process_Transformation2.1/"
PUBLISH = ["index.html", "processiq.html"]  # + .nojekyll, written below


def git(args, cwd=ROOT, check=True):
    return subprocess.run(["git"] + args, cwd=cwd, check=check,
                          capture_output=True, text=True)


def main():
    # 1. fresh build
    print("-> Building...")
    r = subprocess.run([sys.executable, os.path.join("scripts", "build.py")], cwd=ROOT)
    if r.returncode != 0:
        sys.exit("Build failed — aborting deploy.")
    for f in PUBLISH:
        if not os.path.exists(os.path.join(PUB, f)):
            sys.exit("Missing public/%s — did the build run?" % f)

    # 2. clean any stale worktree from a previous run
    git(["worktree", "remove", "--force", TMP], check=False)
    if os.path.isdir(TMP):
        shutil.rmtree(TMP, ignore_errors=True)

    # 3. check out gh-pages into a throwaway worktree (reset to remote if it exists)
    print("-> Preparing gh-pages worktree...")
    git(["fetch", "origin", BRANCH], check=False)
    res = git(["worktree", "add", "-B", BRANCH, TMP, "origin/" + BRANCH], check=False)
    if res.returncode != 0:
        # no remote branch yet — create a fresh one
        git(["worktree", "add", "-B", BRANCH, TMP], check=True)

    # 4. wipe the worktree contents (keep .git) and copy in only the built files
    for entry in os.listdir(TMP):
        if entry == ".git":
            continue
        p = os.path.join(TMP, entry)
        shutil.rmtree(p, ignore_errors=True) if os.path.isdir(p) else os.remove(p)
    for f in PUBLISH:
        shutil.copy2(os.path.join(PUB, f), os.path.join(TMP, f))
    open(os.path.join(TMP, ".nojekyll"), "w").close()  # tell Pages not to run Jekyll

    # 5. commit + push (skip if nothing changed)
    git(["add", "-A"], cwd=TMP)
    status = git(["status", "--porcelain"], cwd=TMP).stdout.strip()
    if not status:
        print("-> No changes since last deploy - site already current.")
    else:
        git(["commit", "-m", "Deploy Process Transformation Accelerator (built, synthetic data only)"], cwd=TMP)
        print("-> Pushing to origin/%s..." % BRANCH)
        push = git(["push", "origin", BRANCH], cwd=TMP, check=False)
        if push.returncode != 0:
            git(["worktree", "remove", "--force", TMP], check=False)
            sys.exit("Push failed:\n" + push.stderr)

    # 6. clean up the worktree
    git(["worktree", "remove", "--force", TMP], check=False)
    if os.path.isdir(TMP):
        shutil.rmtree(TMP, ignore_errors=True)

    print("\n[OK] Deployed.  %s" % URL)
    print("  (GitHub Pages may take ~1 minute to refresh its CDN.)")


if __name__ == "__main__":
    main()
