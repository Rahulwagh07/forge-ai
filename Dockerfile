
# No secrets are ever baked into this image; GitHub auth arrives at runtime
# inside the clone URL.

FROM node:22-bookworm-slim

# Build-time only - must not leak into the runtime container env.
ARG DEBIAN_FRONTEND=noninteractive

# PIP_BREAK_SYSTEM_PACKAGES: Debian 12+ blocks bare `pip install`;
# GIT_TERMINAL_PROMPT: fail fast instead of hanging.
ENV PIP_BREAK_SYSTEM_PACKAGES=1 \
    GIT_TERMINAL_PROMPT=0

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      jq \
      ripgrep \
      build-essential \
      procps \
      unzip \
      xz-utils \
      python3 \
      python3-pip \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash agent
USER agent
WORKDIR /workspace

RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/home/agent/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

RUN git config --global --add safe.directory '*' \
  && git config --global init.defaultBranch main

# All work happens through `exec`; the container just needs to stay alive.
ENTRYPOINT ["sleep", "infinity"]
